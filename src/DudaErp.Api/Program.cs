using DudaErp.Api.Data;
using DudaErp.Api.Services;
using Microsoft.EntityFrameworkCore;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Diagnostics;
using DudaErp.Api.Domain;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.RateLimiting;
using System.Security.Claims;
using System.Threading.RateLimiting;

var builder = WebApplication.CreateBuilder(args);
var port = Environment.GetEnvironmentVariable("PORT");

if (!string.IsNullOrWhiteSpace(port))
{
    builder.WebHost.UseUrls($"http://0.0.0.0:{port}");
}

builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
        options.JsonSerializerOptions.ReferenceHandler = ReferenceHandler.IgnoreCycles;
    });
builder.Services.AddProblemDetails();
builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
        policy
            .WithOrigins(builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
                ?? ["https://cmathxus.github.io", "http://localhost:5161", "https://localhost:7295"])
            .AllowAnyHeader()
            .AllowAnyMethod());
});
builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("Postgres"), postgres =>
    {
        if (new Npgsql.NpgsqlConnectionStringBuilder(builder.Configuration.GetConnectionString("Postgres")).SearchPath == "forty")
            postgres.MigrationsHistoryTable("__EFMigrationsHistory", "forty");
    }));
builder.Services.AddScoped<OrderService>();
builder.Services.AddScoped<PasswordHasher<AppUser>>();
builder.Services.AddAuthentication("Bearer").AddBearerToken("Bearer", options =>
    options.BearerTokenExpiration = TimeSpan.FromHours(8));
builder.Services.AddAuthorization(options => options.FallbackPolicy =
    new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build());
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("login", context => RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
});

var app = builder.Build();

app.UseExceptionHandler(handler => handler.Run(async context =>
{
    var error = context.Features.Get<IExceptionHandlerFeature>()?.Error;
    var validation = error is InvalidOperationException;
    await Results.Problem(statusCode: validation ? 400 : 500,
        title: validation ? "Revise os dados informados." : "Não foi possível concluir a operação.",
        detail: validation ? error!.Message : "Tente novamente. Se o problema continuar, entre em contato com o suporte.")
        .ExecuteAsync(context);
}));

app.UseHttpsRedirection();
app.UseCors("Frontend");
app.UseDefaultFiles();
app.UseStaticFiles();
app.UseRouting();
app.UseRateLimiter();
app.UseAuthentication();
app.Use(async (context, next) =>
{
    if (context.User.Identity?.IsAuthenticated == true)
    {
        var db = context.RequestServices.GetRequiredService<AppDbContext>();
        var idText = context.User.FindFirstValue(ClaimTypes.NameIdentifier);
        var stampText = context.User.FindFirstValue("security_stamp");
        if (!Guid.TryParse(idText, out var id) || !Guid.TryParse(stampText, out var stamp) ||
            !await db.Users.AsNoTracking().AnyAsync(x => x.Id == id && x.IsActive && x.SecurityStamp == stamp, context.RequestAborted))
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return;
        }
    }
    await next(context);
});
app.UseAuthorization();
app.MapControllers();
app.MapGet("/health", () => Results.Ok(new { status = "healthy" })).AllowAnonymous();

using (var scope = app.Services.CreateScope())
{
    var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    if (new Npgsql.NpgsqlConnectionStringBuilder(builder.Configuration.GetConnectionString("Postgres")).SearchPath == "forty")
        await dbContext.Database.ExecuteSqlRawAsync("CREATE SCHEMA IF NOT EXISTS forty");
    await dbContext.Database.MigrateAsync();

    var adminEmail = builder.Configuration["Authentication:AdminEmail"]?.Trim().ToLowerInvariant();
    var adminPassword = builder.Configuration["Authentication:AdminPassword"];
    if (!string.IsNullOrWhiteSpace(adminEmail) && !string.IsNullOrWhiteSpace(adminPassword) &&
        !await dbContext.Users.AnyAsync(x => x.Email == adminEmail))
    {
        var admin = new AppUser { Email = adminEmail, Name = "Administrador", PasswordHash = "" };
        admin.PasswordHash = scope.ServiceProvider.GetRequiredService<PasswordHasher<AppUser>>().HashPassword(admin, adminPassword);
        dbContext.Users.Add(admin);
        await dbContext.SaveChangesAsync();
    }
}

app.Run();

public partial class Program;
