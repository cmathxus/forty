using DudaErp.Api.Contracts;
using DudaErp.Api.Controllers;
using DudaErp.Api.Data;
using DudaErp.Api.Domain;
using DudaErp.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace DudaErp.Api.Tests;

public sealed class PostgresFactAttribute : FactAttribute
{
    public PostgresFactAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("FORTY_TEST_CONNECTION")))
            Skip = "Defina FORTY_TEST_CONNECTION para um PostgreSQL de teste migrado.";
    }
}

public sealed class PostgresWorkflowTests
{
    [PostgresFact]
    public async Task OrdersAndLoads_PreserveHistoryAndReplaceItemsAtomically()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseNpgsql(Environment.GetEnvironmentVariable("FORTY_TEST_CONNECTION")).Options;
        await using var db = new AppDbContext(options);
        // Todas as escritas deste teste são revertidas, inclusive em caso de falha.
        await using var transaction = await db.Database.BeginTransactionAsync();
        var suffix = Guid.NewGuid().ToString("N");
        var region = new Region { Name = $"QA {suffix}" };
        var seller = new Seller { Code = suffix, Name = "QA" };
        var customer = new Customer { LegalName = "QA", TaxId = suffix, Street = "Rua QA", Number = "1",
            District = "Centro", City = "São Paulo", State = "SP", PostalCode = "00000000", RegionId = region.Id, SellerId = seller.Id };
        var product = new Product { Code = suffix, Name = "QA", Unit = "FD", SalePrice = 10m, WeightInKg = 1m };
        db.AddRange(region, seller, customer, product);
        await db.SaveChangesAsync();
        var service = new OrderService(db);
        var request = new CreateOrderRequest(customer.Id, seller.Id, false, null, null,
            [new CreateOrderItemRequest(product.Code, 2)]);
        var order = await service.CreateAsync(request, default);
        await service.UpdateAsync(order.Id, request with { Items = [new CreateOrderItemRequest(product.Code, 3)] }, default);
        Assert.Equal(30m, order.TotalAmount);
        Assert.Equal(1, await db.OrderItems.CountAsync(x => x.OrderId == order.Id));

        var originalItemId = await db.OrderItems.Where(x => x.OrderId == order.Id).Select(x => x.Id).SingleAsync();
        await Assert.ThrowsAsync<InvalidOperationException>(() => service.UpdateAsync(order.Id,
            request with { Items = [new CreateOrderItemRequest(product.Code, 0)] }, default));
        db.ChangeTracker.Clear();
        Assert.Equal(originalItemId, await db.OrderItems.Where(x => x.OrderId == order.Id).Select(x => x.Id).SingleAsync());
        Assert.Equal(30m, (await db.Orders.SingleAsync(x => x.Id == order.Id)).TotalAmount);

        var loads = new DeliveryLoadsController(db);
        var created = await loads.Create(new CreateDeliveryLoadRequest(DateOnly.FromDateTime(DateTime.Today),
            region.Id, null, "QA", null, [order.Id]), default);
        Assert.IsType<CreatedAtActionResult>(created.Result);
        var load = await db.DeliveryLoads.Include(x => x.Orders).SingleAsync(x => x.RegionId == region.Id);
        var linkId = load.Orders.Single().Id;
        await Assert.ThrowsAsync<InvalidOperationException>(() => service.UpdateAsync(order.Id, request, default));
        Assert.IsType<ConflictObjectResult>(await new OrdersController(db, service).Delete(order.Id, default));

        var updated = await loads.Update(load.Id, new UpdateDeliveryLoadRequest(load.ScheduledDate, region.Id, null, "QA editado", null, [order.Id]), default);
        Assert.IsType<OkObjectResult>(updated.Result);
        Assert.Equal(linkId, (await db.DeliveryLoadOrders.SingleAsync(x => x.OrderId == order.Id)).Id);
        Assert.IsType<NoContentResult>(await loads.Dispatch(load.Id, default));
        Assert.IsType<ConflictObjectResult>(await loads.Delete(load.Id, default));
        Assert.IsType<ConflictObjectResult>(await loads.Dispatch(load.Id, default));
        var closed = await loads.CloseOrder(load.Id, order.Id,
            new CloseDeliveryRequest(DeliveryStatus.Delivered, PaymentMethod.Pix, 30m, "QA"), default);
        Assert.IsType<OkObjectResult>(closed.Result);
        Assert.Equal(LoadStatus.Closed, load.Status);
        var persistedLink = await db.DeliveryLoadOrders.SingleAsync(x => x.OrderId == order.Id);
        Assert.Equal(30m, persistedLink.AmountReceived);
        Assert.NotNull(persistedLink.DeliveredAt);
        Assert.IsType<ConflictObjectResult>((await loads.CloseOrder(load.Id, order.Id,
            new CloseDeliveryRequest(DeliveryStatus.Returned, PaymentMethod.None, 0, null), default)).Result);
        await Assert.ThrowsAsync<InvalidOperationException>(() => service.UpdateAsync(order.Id, request, default));
        Assert.IsType<ConflictObjectResult>(await loads.Delete(load.Id, default));
        var financial = new FinancialController(db);
        var payable = new AccountPayable { Description = "QA", DueDate = DateOnly.FromDateTime(DateTime.Today), Amount = 10m };
        db.AccountsPayable.Add(payable);
        await db.SaveChangesAsync();
        Assert.IsType<OkObjectResult>((await financial.Pay(payable.Id, new SettleAccountRequest(null), default)).Result);
        Assert.IsType<ConflictObjectResult>(await financial.DeletePayable(payable.Id, default));
        Assert.IsType<ConflictObjectResult>((await financial.Pay(payable.Id, new SettleAccountRequest(null), default)).Result);
        await transaction.RollbackAsync();
    }
}
