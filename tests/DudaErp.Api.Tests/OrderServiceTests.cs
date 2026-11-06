using DudaErp.Api.Contracts;
using DudaErp.Api.Data;
using DudaErp.Api.Domain;
using DudaErp.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace DudaErp.Api.Tests;

public sealed class OrderServiceTests
{
    [Fact]
    public async Task CreateAsync_FillsPriceAndCalculatesTotalsFromProductCode()
    {
        await using var dbContext = CreateContext();
        var region = new Region { Name = "Osasco" };
        var seller = new Seller { Code = "FABIO", Name = "Fábio" };
        var customer = CreateCustomer(region.Id, seller.Id);
        var product = new Product
        {
            Code = "4300", Name = "Pipoca 40 g", Unit = "FD",
            SalePrice = 19.80m, WeightInKg = 0.9m
        };
        dbContext.AddRange(region, seller, customer, product);
        await dbContext.SaveChangesAsync();

        var service = new OrderService(dbContext);
        var order = await service.CreateAsync(
            new CreateOrderRequest(customer.Id, null, false, new DateOnly(2026, 7, 24), null,
                [new CreateOrderItemRequest("4300", 20)]),
            CancellationToken.None);

        Assert.Equal(0, order.Number);
        Assert.Equal(396m, order.TotalAmount);
        Assert.Equal(18m, order.TotalWeightInKg);
        Assert.Equal(19.80m, order.Items.Single().UnitPrice);
        Assert.Equal(seller.Id, order.SellerId);
    }

    [Fact]
    public async Task CreateAsync_RejectsUnknownProductCode()
    {
        await using var dbContext = CreateContext();
        var region = new Region { Name = "Zona Leste" };
        var seller = new Seller { Code = "01", Name = "Osnir" };
        var customer = CreateCustomer(region.Id, seller.Id);
        dbContext.AddRange(region, seller, customer);
        await dbContext.SaveChangesAsync();

        var service = new OrderService(dbContext);
        var action = () => service.CreateAsync(
            new CreateOrderRequest(customer.Id, null, false, null, null,
                [new CreateOrderItemRequest("INEXISTENTE", 1)]),
            CancellationToken.None);

        var exception = await Assert.ThrowsAsync<InvalidOperationException>(action);
        Assert.Contains("INEXISTENTE", exception.Message);
    }

    [Theory]
    [InlineData(0, 10, 10)]
    [InlineData(1.0001, 10, 10)]
    [InlineData(2, 10, 100)]
    public async Task CreateAsync_RejectsInvalidQuantityOrInconsistentPricing(decimal quantity, decimal unitPrice, decimal total)
    {
        await using var db = CreateContext();
        var region = new Region { Name = "QA" };
        var seller = new Seller { Code = "QA", Name = "QA" };
        var customer = CreateCustomer(region.Id, seller.Id);
        var product = new Product { Code = "QA", Name = "QA", Unit = "FD", SalePrice = 10, WeightInKg = 1 };
        db.AddRange(region, seller, customer, product);
        await db.SaveChangesAsync();
        await Assert.ThrowsAsync<InvalidOperationException>(() => new OrderService(db).CreateAsync(
            new CreateOrderRequest(customer.Id, seller.Id, false, null, null,
                [new CreateOrderItemRequest(product.Code, quantity, unitPrice, total)]), default));
        Assert.Empty(await db.Orders.ToListAsync());
    }

    private static AppDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new AppDbContext(options);
    }

    private static Customer CreateCustomer(Guid regionId, Guid sellerId) => new()
    {
        LegalName = "Cliente Teste Ltda", TaxId = "00000000000100", Street = "Rua A",
        Number = "1", District = "Centro", City = "São Paulo", State = "SP",
        PostalCode = "00000000", RegionId = regionId, SellerId = sellerId
    };
}
