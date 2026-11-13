using DudaErp.Api.Contracts;
using DudaErp.Api.Controllers;
using DudaErp.Api.Domain;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace DudaErp.Api.Tests;

public sealed class LoadFilteringTests
{
    private static PageResult<DeliveryLoad> Page(IActionResult result) => Assert.IsType<PageResult<DeliveryLoad>>(Assert.IsType<OkObjectResult>(result).Value);

    [PostgresFact]
    public async Task Filters_RunBeforePagination_AndMatchRelatedLocationAndShortages()
    {
        await using var database = await PostgresTestDatabase.CreateAsync(); var db = database.Db;
        var region = new Region { Name = "Interior %_" };
        var vehicle = new Vehicle { Name = "Caminhão", Plate = "QAT1234" };
        var seller = new Seller { Name = "Vendedor QA", Code = "QA" };
        var customer = new Customer { LegalName = "Cliente QA", TaxId = "123", City = "São Paulo", District = "Vila Mariana", State = "SP", Street = "Rua", Number = "1", PostalCode = "00000000", RegionId = region.Id, SellerId = seller.Id };
        db.AddRange(region, vehicle, seller, customer);
        for (var i = 1; i <= 25; i++) db.DeliveryLoads.Add(new DeliveryLoad { Number = i, RegionId = region.Id, VehicleId = vehicle.Id, ScheduledDate = new(2026,11,10), DriverName = "João", Status = LoadStatus.Open });
        var product = new Product { Code = "QA", Name = "QA", Unit = "FD" };
        db.Products.Add(product);
        var item = new OrderItem { ProductId = product.Id, ProductCode = "QA", ProductName = "QA", Unit = "FD", Quantity = 10, UnitPrice = 10, TotalAmount = 100 };
        var order = new Order { Number = 99, CustomerId = customer.Id, SellerId = seller.Id, Status = OrderStatus.Scheduled, Items = [item] };
        var target = new DeliveryLoad { Number = 99, RegionId = region.Id, VehicleId = vehicle.Id, ScheduledDate = new(2026,11,9), DriverName = "Pedro", Status = LoadStatus.Dispatched,
            ReturnedAt = DateTimeOffset.UtcNow, Orders = [new DeliveryLoadOrder { Order = order, ItemResults = [new DeliveryItemResult { OrderItem = item, DeliveredQuantity = 0, ReturnedQuantity = 8, MissingQuantity = 2 }] }] };
        db.Add(target); await db.SaveChangesAsync(); db.ChangeTracker.Clear();
        var controller = new DeliveryLoadsController(db);
        var first = Page(await controller.GetPage(new(), default)); var last = Page(await controller.GetPage(new() { Page=2 }, default));
        Assert.Equal(26, first.Total); Assert.Equal(20, first.Items.Count); Assert.Equal(6, last.Items.Count);
        Assert.Empty(first.Items.Select(x=>x.Id).Intersect(last.Items.Select(x=>x.Id)));
        Assert.Single(Page(await controller.GetPage(new() { Stage=2, RegionId=region.Id, VehicleId=vehicle.Id, Driver="pEdRo", From=new(2026,11,9), To=new(2026,11,9), Shortages=true, Search="vila mariana" }, default)).Items);
        Assert.Equal(target.Id, Assert.Single(Page(await controller.GetPage(new() { Search="sÃO pAULO" }, default)).Items).Id);
        Assert.Single(Page(await controller.GetPage(new() { Search="Cliente QA" }, default)).Items);
        Assert.Equal(26, Page(await controller.GetPage(new() { Search="%_" }, default)).Total); // Curingas digitados são literais.
        Assert.Empty(Page(await controller.GetPage(new() { Stage=1 }, default)).Items);
        Assert.Empty(Page(await controller.GetPage(new() { From=new(2026,11,11) }, default)).Items);
        Assert.Empty(Page(await controller.GetPage(new() { Search="inexistente" }, default)).Items);
        Assert.Equal(25, Page(await controller.GetPage(new() { Stage=0 }, default)).Total);
        Assert.Equal(2, Page(await controller.GetPage(new() { Page=999 }, default)).Page);
        var options = System.Text.Json.JsonSerializer.Serialize(Assert.IsType<OkObjectResult>(await controller.FilterOptions(default)).Value);
        Assert.Contains(region.Id.ToString(), options); Assert.Contains(vehicle.Id.ToString(), options);
        var summary = System.Text.Json.JsonSerializer.SerializeToElement(Assert.IsType<OkObjectResult>(await controller.Summary(default)).Value);
        Assert.Equal(25, summary.GetProperty("preparing").GetInt32()); Assert.Equal(0, summary.GetProperty("onRoute").GetInt32());
        var orders = new ListPagesController(db);
        var orderPage = Assert.IsType<PageResult<Order>>(Assert.IsType<OkObjectResult>(await orders.Orders(new() { Search="Cliente QA" }, default, OrderStatus.Scheduled)).Value);
        Assert.Single(orderPage.Items);
        Assert.Empty(Assert.IsType<PageResult<Order>>(Assert.IsType<OkObjectResult>(await orders.Orders(new(), default, OrderStatus.Delivered)).Value).Items);
    }
}
