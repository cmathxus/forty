using DudaErp.Api.Contracts;
using DudaErp.Api.Controllers;
using DudaErp.Api.Domain;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace DudaErp.Api.Tests;

public sealed class ListPaginationTests
{
    private static PageResult<T> Page<T>(IActionResult result) => Assert.IsType<PageResult<T>>(Assert.IsType<OkObjectResult>(result).Value);

    [PostgresFact]
    public async Task CatalogPages_SearchInDatabase_BoundResults_AndRecoverAfterDeletion()
    {
        await using var database = await PostgresTestDatabase.CreateAsync();
        var db = database.Db;
        var region = new Region { Name = "Região base" };
        var seller = new Seller { Code = "BASE", Name = "Vendedor base" };
        db.AddRange(region, seller);
        for (var i = 0; i < 45; i++)
        {
            db.Products.Add(new Product { Code = $"P{i:D3}", Name = i == 44 ? "Alvo %_" : "Produto", Unit = "FD" });
            db.Customers.Add(new Customer { LegalName = "Cliente", TradeName = i == 44 ? "Localizável" : null,
                TaxId = $"{i:D14}", City = "São Paulo", Street = "Rua", Number = "1", District = "Centro", State = "SP", PostalCode = "00000000",
                RegionId = region.Id, SellerId = seller.Id });
            db.Sellers.Add(new Seller { Name = $"Vendedor {i:D3}", Code = $"V{i:D3}", Phone = i == 44 ? "3199999" : null });
            db.Regions.Add(new Region { Name = $"Região {i:D3}" });
            db.Vehicles.Add(new Vehicle { Name = $"Caminhão {i:D3}", Plate = $"ABC{i:D4}", Model = i == 44 ? "Especial" : null });
            db.Users.Add(new AppUser { Name = $"Usuário {i:D3}", Email = $"user{i}@example.invalid", Role = i == 44 ? "Produção" : "Faturamento", PasswordHash = "nunca-retornar" });
        }
        db.Products.Add(new Product { Code = "INATIVO", Name = "Alvo %_", Unit = "FD", IsActive = false });
        await db.SaveChangesAsync();
        db.ChangeTracker.Clear();
        var controller = new ListPagesController(db);
        var first = Page<Product>(await controller.Products(new(), default));
        var second = Page<Product>(await controller.Products(new() { Page = 2 }, default));
        var last = Page<Product>(await controller.Products(new() { Page = 3 }, default));
        Assert.Equal(45, first.Total); Assert.Equal(20, first.PageSize); Assert.Equal(3, first.TotalPages);
        Assert.Equal(20, first.Items.Count); Assert.Equal(20, second.Items.Count); Assert.Equal(5, last.Items.Count);
        Assert.Empty(first.Items.Select(x => x.Id).Intersect(second.Items.Select(x => x.Id)));
        Assert.Equal("P020", second.Items[0].Code);
        Assert.Single(Page<Product>(await controller.Products(new() { Search = "  aLvO  " }, default)).Items);
        Assert.Single(Page<Product>(await controller.Products(new() { Search = "%_" }, default)).Items);
        Assert.Empty(Page<Product>(await controller.Products(new() { Search = "sem resultado" }, default)).Items);
        Assert.Single(Page<Customer>(await controller.Customers(new() { Search = "localizável" }, default)).Items);
        Assert.Single(Page<Seller>(await controller.Sellers(new() { Search = "3199999" }, default)).Items);
        Assert.Single(Page<Vehicle>(await controller.Vehicles(new() { Search = "especial" }, default)).Items);
        Assert.Equal(20, Page<Region>(await controller.Regions(new(), default)).Items.Count);
        var users = Page<UsersController.UserView>(await controller.Users(new() { Search = "produção" }, default));
        Assert.Single(users.Items); Assert.DoesNotContain("nunca-retornar", System.Text.Json.JsonSerializer.Serialize(users));
        var customers1 = Page<Customer>(await controller.Customers(new(), default));
        var customers2 = Page<Customer>(await controller.Customers(new() { Page = 2 }, default));
        Assert.Empty(customers1.Items.Select(x => x.Id).Intersect(customers2.Items.Select(x => x.Id)));
        db.Products.RemoveRange(last.Items); await db.SaveChangesAsync();
        var recovered = Page<Product>(await controller.Products(new() { Page = 3 }, default));
        Assert.Equal(2, recovered.Page); Assert.Equal(40, recovered.Total); Assert.Equal(20, recovered.Items.Count);
    }
}
