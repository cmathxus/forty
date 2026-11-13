using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Security.Claims;
using DudaErp.Api.Controllers;
using DudaErp.Api.Data;
using DudaErp.Api.Domain;
using DudaErp.Api.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace DudaErp.Api.Tests;

public sealed class AccessControlTests
{
    [Fact]
    public async Task CustomPermissionsReplaceTemplateAndRevokeExistingSession()
    {
        await using var factory = new Factory();
        using var admin = await factory.Login(AccessRules.Admin);
        var email = "custom@example.invalid";
        var create = new { name = "Custom", email, role = AccessRules.Billing, password = "test-password-123",
            customPermissions = new[] { "products.read", "payables.read", "payables.check" } };
        var created = await admin.PostAsJsonAsync("/api/users", create);
        Assert.Equal(HttpStatusCode.OK, created.StatusCode);
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        using var user = await factory.LoginEmail(email, create.password);
        Assert.Equal(HttpStatusCode.OK, (await user.GetAsync("/api/financial/payables")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await user.GetAsync("/api/customers")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await user.GetAsync("/api/users/permissions")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await user.PostAsJsonAsync("/api/catalog/products", new { })).StatusCode);
        var payable = $"/api/financial/payables/{Guid.NewGuid()}";
        Assert.Equal(HttpStatusCode.NotFound, (await user.PostAsync(payable + "/check", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await user.PostAsJsonAsync(payable + "/pay", new { })).StatusCode);
        var me = await user.GetFromJsonAsync<JsonElement>("/api/auth/me");
        Assert.Equal(new[] { "payables.check", "payables.read", "products.read" },
            me.GetProperty("permissions").EnumerateArray().Select(x => x.GetString()));
        var update = new { create.name, create.email, create.role, isActive = true, customPermissions = new[] { "users.manage" } };
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PutAsJsonAsync($"/api/users/{id}", update)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await admin.PutAsJsonAsync($"/api/users/{id}", update with { customPermissions = Array.Empty<string>() })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await user.GetAsync("/api/auth/me")).StatusCode);
        using var empty = await factory.LoginEmail(email, create.password);
        Assert.Equal(HttpStatusCode.Forbidden, (await empty.GetAsync("/api/financial/payables")).StatusCode);
        var restore = new UsersController.UpdateUserRequest(create.name, create.email, create.role, true);
        Assert.Equal(HttpStatusCode.OK, (await admin.PutAsJsonAsync($"/api/users/{id}", restore)).StatusCode);
        using var restored = await factory.LoginEmail(email, create.password);
        Assert.Equal(HttpStatusCode.OK, (await restored.GetAsync("/api/customers")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await restored.GetAsync("/api/financial/payables")).StatusCode);
    }

    [Fact]
    public async Task PayableAuthorCannotPayOrCheckEvenAsAdmin()
    {
        await using var factory = new Factory();
        using var author = await factory.Login(AccessRules.Admin);
        using var second = await factory.Login(AccessRules.Finance);
        using var buyer = await factory.Login(AccessRules.Buyer);
        using var created = await author.PostAsJsonAsync("/api/financial/payables",
            new { description = "Tarifa de boleto", amount = 5, dueDate = "2026-11-13" });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var id = (await created.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetGuid();
        var pay = $"/api/financial/payables/{id}/pay";
        var check = $"/api/financial/payables/{id}/check";
        Assert.Equal(HttpStatusCode.Conflict, (await author.PostAsJsonAsync(pay, new { date = "2026-11-13" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await buyer.PostAsJsonAsync(pay, new { date = "2026-11-13" })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await second.PostAsync(check, null)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await second.PostAsJsonAsync(pay, new { date = "2026-11-13" })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await author.PostAsync(check, null)).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await second.PostAsync(check, null)).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await second.PostAsync(check, null)).StatusCode);
    }

    [Fact]
    public async Task ListPages_ValidateLimits_AndEnforceSectorPermissions()
    {
        await using var factory = new Factory();
        using var anonymous = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/lists/products")).StatusCode);
        foreach (var role in AccessRules.Roles)
        {
            using var client = await factory.Login(role);
            Assert.Equal(role == AccessRules.Buyer ? HttpStatusCode.Forbidden : HttpStatusCode.OK, (await client.GetAsync("/api/lists/products")).StatusCode);
            Assert.Equal(role is AccessRules.Admin or AccessRules.Billing or AccessRules.Finance ? HttpStatusCode.OK : HttpStatusCode.Forbidden,
                (await client.GetAsync("/api/lists/customers")).StatusCode);
            foreach (var area in new[] { "sellers", "regions", "vehicles", "users" })
                Assert.Equal(role == AccessRules.Admin || (area != "users" && role is AccessRules.Billing or AccessRules.Finance or AccessRules.Dispatch)
                    ? HttpStatusCode.OK : HttpStatusCode.Forbidden,
                    (await client.GetAsync($"/api/lists/{area}")).StatusCode);
        }
        using var admin = await factory.Login(AccessRules.Admin);
        foreach (var query in new[] { "page=0", "pageSize=200", "stage=4", "regionId=invalid", "from=2026-11-10&to=2026-11-09", "search=" + new string('a',201) })
            Assert.Equal(HttpStatusCode.BadRequest, (await admin.GetAsync("/api/delivery-loads/page?" + query)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/delivery-loads/page")).StatusCode);
        using var production = await factory.Login(AccessRules.Production);
        Assert.Equal(HttpStatusCode.Forbidden, (await production.GetAsync("/api/delivery-loads/page")).StatusCode);
        foreach (var query in new[] { "page=0", "page=-1", "page=1000001", "pageSize=200", "pageSize=0", "search=" + new string('a', 201) })
            Assert.Equal(HttpStatusCode.BadRequest, (await admin.GetAsync("/api/lists/products?" + query)).StatusCode);
    }

    [PostgresFact]
    public async Task ConcurrentAdminChanges_KeepAtLeastOneAdministrator()
    {
        await using var database = await PostgresTestDatabase.CreateAsync();
        var first = new AppUser { Name = "Primeiro", Email = "first@example.invalid", Role = AccessRules.Admin, PasswordHash = "not-used" };
        var second = new AppUser { Name = "Segundo", Email = "second@example.invalid", Role = AccessRules.Admin, PasswordHash = "not-used" };
        database.Db.Users.AddRange(first, second); await database.Db.SaveChangesAsync();
        async Task<bool> Demote(AppUser actor, AppUser target)
        {
            await using var db = new AppDbContext(database.Options);
            var controller = new UsersController(db, new PasswordHasher<AppUser>()) { ControllerContext = new ControllerContext {
                HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity([
                    new Claim(ClaimTypes.NameIdentifier, actor.Id.ToString()), new Claim(ClaimTypes.Role, AccessRules.Admin)], "Bearer")) } } };
            return await controller.Update(target.Id, new(target.Name, target.Email, AccessRules.Billing, true), default) is OkObjectResult;
        }
        var results = await Task.WhenAll(Demote(first, second), Demote(second, first));
        Assert.Single(results, x => x);
        Assert.Equal(1, await database.Db.Users.CountAsync(x => x.IsActive && x.Role == AccessRules.Admin));
    }

    private sealed class Factory : WebApplicationFactory<Program>
    {
        private readonly string name = Guid.NewGuid().ToString();
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("Testing");
            builder.ConfigureServices(services => {
                services.RemoveAll<DbContextOptions<AppDbContext>>();
                services.RemoveAll<AppDbContext>();
                services.AddDbContext<AppDbContext>(options => options.UseInMemoryDatabase(name));
            });
        }
        public async Task<HttpClient> Login(string role)
        {
            using var scope = Services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var user = new AppUser { Name = role, Email = $"{Guid.NewGuid():N}@example.invalid", Role = role, PasswordHash = "" };
            user.PasswordHash = new PasswordHasher<AppUser>().HashPassword(user, "test-password-123");
            db.Users.Add(user); await db.SaveChangesAsync();
            return await LoginEmail(user.Email, "test-password-123");
        }
        public async Task<HttpClient> LoginEmail(string email, string password)
        {
            var client = CreateClient(new() { BaseAddress = new Uri("https://localhost"), AllowAutoRedirect = false });
            var response = await client.PostAsJsonAsync("/api/auth/login", new { email, password });
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var token = (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("accessToken").GetString();
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
            return client;
        }
    }

    [Fact]
    public async Task Roles_EnforceReadAndWritePermissionsThroughHttp()
    {
        await using var factory = new Factory();
        using (var scope = factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            var product = new Product { Name = "Produto QA", Code = "QA", Unit = "FD", SalePrice = 10 };
            db.Products.Add(product);
            db.StockMovements.Add(new StockMovement { ProductId = product.Id, Unit = "FD", Kind = StockMovementKind.Receipt,
                Quantity = 5, Reason = "Entrada QA", SourceKey = "qa", RecordedBy = "Admin" });
            await db.SaveChangesAsync();
        }
        var everyone = new[] { "/api/catalog/products", "/api/inventory" };
        var areas = new Dictionary<string, string[]> {
            [AccessRules.Admin] = ["/api/users", "/api/customers", "/api/orders/page", "/api/financial/payables", "/api/financial/receivables", "/api/delivery-loads", "/api/production", "/api/catalog/regions", "/api/catalog/sellers", "/api/catalog/vehicles"],
            [AccessRules.Billing] = ["/api/customers", "/api/orders/page", "/api/catalog/regions", "/api/catalog/sellers", "/api/catalog/vehicles"],
            [AccessRules.Finance] = ["/api/customers", "/api/orders/page", "/api/financial/payables", "/api/financial/receivables", "/api/catalog/regions", "/api/catalog/sellers", "/api/catalog/vehicles"],
            [AccessRules.Buyer] = ["/api/financial/payables"],
            [AccessRules.Dispatch] = ["/api/orders/page", "/api/delivery-loads", "/api/catalog/regions", "/api/catalog/sellers", "/api/catalog/vehicles"],
            [AccessRules.Production] = ["/api/production"]
        };
        var writeAreas = new Dictionary<string, string[]> {
            [AccessRules.Admin] = ["/api/users", "/api/customers", "/api/orders", "/api/financial/payables", "/api/financial/receivables", "/api/catalog/products", "/api/production", "/api/delivery-loads", "/api/inventory/movements"],
            [AccessRules.Billing] = ["/api/customers", "/api/orders", "/api/financial/receivables"],
            [AccessRules.Finance] = ["/api/financial/payables", "/api/financial/receivables"],
            [AccessRules.Buyer] = [],
            [AccessRules.Dispatch] = ["/api/delivery-loads"],
            [AccessRules.Production] = ["/api/production"]
        };
        foreach (var role in AccessRules.Roles)
        {
            using var client = await factory.Login(role);
            foreach (var path in everyone)
                Assert.Equal(role == AccessRules.Buyer ? HttpStatusCode.Forbidden : HttpStatusCode.OK, (await client.GetAsync(path)).StatusCode);
            if (role != AccessRules.Buyer)
            {
                var stock = await client.GetFromJsonAsync<JsonElement>("/api/inventory");
                Assert.Equal(5, stock.GetProperty("items")[0].GetProperty("quantity").GetDecimal());
                Assert.Equal(role == AccessRules.Admin ? 1 : 0, stock.GetProperty("movements").GetArrayLength());
            }
            foreach (var path in areas[AccessRules.Admin])
                Assert.Equal(areas[role].Contains(path) ? HttpStatusCode.OK : HttpStatusCode.Forbidden, (await client.GetAsync(path)).StatusCode);
            foreach (var path in writeAreas[AccessRules.Admin])
            {
                // Corpo nulo: autorizados chegam à validação; os demais são bloqueados antes de executar a ação.
                using var response = await client.PostAsync(path, JsonContent.Create((object?)null));
                Assert.Equal(writeAreas[role].Contains(path) ? HttpStatusCode.BadRequest : HttpStatusCode.Forbidden, response.StatusCode);
            }
            var missingOrder = $"/api/orders/{Guid.NewGuid()}";
            Assert.Equal(role is AccessRules.Admin or AccessRules.Finance ? HttpStatusCode.NotFound : HttpStatusCode.Forbidden,
                (await client.PostAsync(missingOrder + "/approve", null)).StatusCode);
            Assert.Equal(role is AccessRules.Admin or AccessRules.Billing ? HttpStatusCode.NotFound : HttpStatusCode.Forbidden,
                (await client.PostAsync(missingOrder + "/bill", null)).StatusCode);
            var me = await client.GetFromJsonAsync<JsonElement>("/api/auth/me");
            Assert.Equal(role, me.GetProperty("role").GetString());
            Assert.Equal(AccessRules.ForRole(role), me.GetProperty("permissions").EnumerateArray().Select(x => x.GetString()));
        }
        using var anonymous = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/users")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync("/api/inventory")).StatusCode);
    }

    [Fact]
    public async Task Admin_ManagesUsers_RevokesSessions_AndCannotLockItselfOut()
    {
        await using var factory = new Factory();
        using var admin = await factory.Login(AccessRules.Admin);
        var ownId = (await admin.GetFromJsonAsync<JsonElement>("/api/auth/me")).GetProperty("id").GetString();
        var create = new { name = "Operador", email = "operador@example.invalid", role = AccessRules.Production, password = "initial-password-123" };
        var created = await admin.PostAsJsonAsync("/api/users", create);
        Assert.Equal(HttpStatusCode.OK, created.StatusCode);
        var text = await created.Content.ReadAsStringAsync();
        Assert.DoesNotContain("password", text, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("securityStamp", text);
        var id = JsonSerializer.Deserialize<JsonElement>(text).GetProperty("id").GetString();
        Assert.Equal(HttpStatusCode.Conflict, (await admin.PostAsJsonAsync("/api/users", create)).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await admin.PostAsJsonAsync("/api/users", create with { role = "superusuario", email = "other@example.invalid" })).StatusCode);
        using var worker = await factory.LoginEmail(create.email, create.password);
        Assert.Equal(HttpStatusCode.Forbidden, (await worker.PutAsJsonAsync($"/api/users/{ownId}", new { name = "X", email = "x@example.invalid", role = AccessRules.Production, isActive = false })).StatusCode);
        var changed = await admin.PutAsJsonAsync($"/api/users/{id}", new { create.name, create.email, role = AccessRules.Dispatch, isActive = true });
        Assert.Equal(HttpStatusCode.OK, changed.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await worker.GetAsync("/api/auth/me")).StatusCode);
        using var dispatch = await factory.LoginEmail(create.email, create.password);
        Assert.Equal(HttpStatusCode.Forbidden, (await dispatch.GetAsync("/api/production")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await dispatch.GetAsync("/api/delivery-loads")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await admin.PostAsJsonAsync($"/api/users/{id}/password", new { password = "new-password-123" })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await dispatch.GetAsync("/api/auth/me")).StatusCode);
        using var reset = await factory.LoginEmail(create.email, "new-password-123");
        Assert.Equal(HttpStatusCode.OK, (await admin.PutAsJsonAsync($"/api/users/{id}", new { create.name, create.email, role = AccessRules.Dispatch, isActive = false })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await reset.GetAsync("/api/auth/me")).StatusCode);
        using var anonymous = factory.CreateClient(new() { BaseAddress = new Uri("https://localhost") });
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.PostAsJsonAsync("/api/auth/login", new { create.email, password = "new-password-123" })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await admin.PutAsJsonAsync($"/api/users/{ownId}", new { name = "Admin", email = "admin@example.invalid", role = AccessRules.Billing, isActive = true })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await admin.PostAsJsonAsync($"/api/users/{ownId}/password", new { password = "own-password-123" })).StatusCode);
        var listed = await admin.GetStringAsync("/api/users");
        Assert.DoesNotContain("passwordHash", listed, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("securityStamp", listed);
    }
}
