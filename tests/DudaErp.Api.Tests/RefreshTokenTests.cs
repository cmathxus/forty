using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using DudaErp.Api.Data;
using DudaErp.Api.Domain;
using DudaErp.Api.Services;
using Microsoft.AspNetCore.Authentication.BearerToken;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;

namespace DudaErp.Api.Tests;

public sealed class RefreshTokenTests
{
    private sealed class Factory(string database, string? connection = null) : WebApplicationFactory<Program>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Testing");
            builder.ConfigureServices(services => {
                services.RemoveAll<DbContextOptions<AppDbContext>>(); services.RemoveAll<AppDbContext>();
                services.AddDbContext<AppDbContext>(options => {
                    if (connection is null) options.UseInMemoryDatabase(database);
                    else options.UseNpgsql(connection, pg => pg.MigrationsHistoryTable("__EFMigrationsHistory", new Npgsql.NpgsqlConnectionStringBuilder(connection).SearchPath));
                });
            });
        }
    }

    private static async Task<JsonElement> Login(Factory factory, HttpClient client)
    {
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var user = new AppUser { Email = "refresh@example.invalid", Name = "Refresh QA", Role = AccessRules.Admin, PasswordHash = "" };
        user.PasswordHash = new PasswordHasher<AppUser>().HashPassword(user, "qa-password-123");
        db.Users.Add(user); await db.SaveChangesAsync();
        var response = await client.PostAsJsonAsync("/api/auth/login", new { user.Email, password = "qa-password-123" });
        response.EnsureSuccessStatusCode();
        Assert.Equal("no-store", response.Headers.CacheControl?.ToString());
        return await response.Content.ReadFromJsonAsync<JsonElement>();
    }

    [Fact]
    public async Task Refresh_RotatesRejectsReplay_AndLogoutRevokesAccessAndRefresh()
    {
        await using var factory = new Factory(Guid.NewGuid().ToString());
        using var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        var first = await Login(factory, client);
        var refresh = first.GetProperty("refreshToken").GetString()!;
        var renewed = await client.PostAsJsonAsync("/api/auth/refresh", new { refreshToken = refresh });
        renewed.EnsureSuccessStatusCode();
        var next = await renewed.Content.ReadFromJsonAsync<JsonElement>();
        Assert.NotEqual(refresh, next.GetProperty("refreshToken").GetString());
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/auth/refresh", new { refreshToken = refresh })).StatusCode);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", next.GetProperty("accessToken").GetString());
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/auth/me")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsJsonAsync("/api/auth/logout", new { refreshToken = next.GetProperty("refreshToken").GetString() })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);
        client.DefaultRequestHeaders.Authorization = null;
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/auth/refresh", new { refreshToken = next.GetProperty("refreshToken").GetString() })).StatusCode);
    }

    [Theory]
    [InlineData("password")]
    [InlineData("disabled")]
    [InlineData("role")]
    [InlineData("expired")]
    public async Task Refresh_RejectsInvalidatedUsersAndExpiredSessions(string change)
    {
        await using var factory = new Factory(Guid.NewGuid().ToString());
        using var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        var tokens = await Login(factory, client);
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>(); var user = await db.Users.SingleAsync(x => x.Email == "refresh@example.invalid");
            if (change == "password") user.SecurityStamp = Guid.NewGuid();
            if (change == "disabled") user.IsActive = false;
            if (change == "role") user.Role = AccessRules.Production;
            if (change == "expired") (await db.AuthSessions.SingleAsync()).ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(-1);
            await db.SaveChangesAsync();
        }
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/auth/refresh", new { refreshToken = tokens.GetProperty("refreshToken").GetString() })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/auth/refresh", new { refreshToken = "invalid" })).StatusCode);
    }

    [Fact]
    public async Task Refresh_AcceptsExpiredAccess_ButRejectsExpiredRefreshTicket()
    {
        await using var factory = new Factory(Guid.NewGuid().ToString());
        using var client = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        var tokens = await Login(factory, client);
        var options = factory.Services.GetRequiredService<IOptionsMonitor<BearerTokenOptions>>().Get("Bearer");
        var access = options.BearerTokenProtector.Unprotect(tokens.GetProperty("accessToken").GetString()!)!;
        access.Properties.ExpiresUtc = DateTimeOffset.UtcNow.AddMinutes(-1);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", options.BearerTokenProtector.Protect(access));
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/auth/me")).StatusCode);
        client.DefaultRequestHeaders.Authorization = null;
        var refresh = tokens.GetProperty("refreshToken").GetString()!;
        var ticket = options.RefreshTokenProtector.Unprotect(refresh)!;
        ticket.Properties.ExpiresUtc = DateTimeOffset.UtcNow.AddMinutes(-1);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync("/api/auth/refresh", new { refreshToken = options.RefreshTokenProtector.Protect(ticket) })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsJsonAsync("/api/auth/refresh", new { refreshToken = refresh })).StatusCode);
    }

    [PostgresFact]
    public async Task ConcurrentRefresh_OnlyOneRotation_AndKeysSurviveServerRestart()
    {
        await using var database = await PostgresTestDatabase.CreateAsync();
        string refresh;
        await using (var firstServer = new Factory("unused", database.Db.Database.GetConnectionString()))
        {
            using var client = firstServer.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
            var tokens = await Login(firstServer, client);
            var original = tokens.GetProperty("refreshToken").GetString();
            var results = await Task.WhenAll(Enumerable.Range(0, 2).Select(_ => client.PostAsJsonAsync("/api/auth/refresh", new { refreshToken = original })));
            Assert.Single(results, x => x.StatusCode == HttpStatusCode.OK);
            Assert.Single(results, x => x.StatusCode == HttpStatusCode.Unauthorized);
            refresh = (await results.Single(x => x.IsSuccessStatusCode).Content.ReadFromJsonAsync<JsonElement>()).GetProperty("refreshToken").GetString()!;
            Assert.NotEmpty(await database.Db.DataProtectionKeys.ToListAsync());
        }
        await using var secondServer = new Factory("unused", database.Db.Database.GetConnectionString());
        using var restartedClient = secondServer.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        Assert.Equal(HttpStatusCode.OK, (await restartedClient.PostAsJsonAsync("/api/auth/refresh", new { refreshToken = refresh })).StatusCode);
    }
}
