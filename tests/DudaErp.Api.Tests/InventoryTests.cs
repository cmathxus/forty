using DudaErp.Api.Contracts;
using DudaErp.Api.Controllers;
using DudaErp.Api.Data;
using DudaErp.Api.Domain;
using DudaErp.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Http;
using System.Security.Claims;
using Microsoft.EntityFrameworkCore;

namespace DudaErp.Api.Tests;

public sealed class InventoryTests
{
    [PostgresFact]
    public async Task UndeliveredLoad_RecordsPhysicalReturnShortageAndOperator()
    {
        await using var database = await PostgresTestDatabase.CreateAsync();
        var db = database.Db;
        var (product, load, order) = await Seed(db, 10);
        var inventory = new InventoryController(db);
        Assert.IsType<OkObjectResult>(await inventory.Record(new(Guid.NewGuid(), product.Id, StockMovementKind.Count, 15, "Contagem inicial"), default));
        var controller = new DeliveryLoadsController(db) { ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext {
            User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.Name, "Conferente QA")], "Bearer")) } } };
        Assert.IsType<ConflictObjectResult>(await controller.RecordReturn(load.Id, new(DateTimeOffset.UtcNow), default));
        Assert.IsType<NoContentResult>(await controller.Dispatch(load.Id, default));
        Assert.Equal("Conferente QA", load.DispatchedBy); Assert.NotNull(load.DispatchedAt);
        var actualReturn = DateTimeOffset.UtcNow;
        Assert.IsType<BadRequestObjectResult>(await controller.RecordReturn(load.Id, new(null), default));
        Assert.IsType<BadRequestObjectResult>(await controller.RecordReturn(load.Id, new(actualReturn.AddDays(1)), default));
        Assert.IsType<BadRequestObjectResult>(await controller.RecordReturn(load.Id, new(load.DispatchedAt.Value.AddMinutes(-1)), default));
        var item = order.Items.Single();
        Assert.IsType<BadRequestObjectResult>((await controller.CloseOrder(load.Id, order.Id,
            new(DeliveryStatus.Returned, PaymentMethod.None, 0, "Retorno sem conferência"), default)).Result);
        Assert.IsType<BadRequestObjectResult>((await controller.CloseOrder(load.Id, order.Id,
            new(DeliveryStatus.Returned, PaymentMethod.None, 0, null, [new(item.Id, 0, 8)]), default)).Result);
        Assert.IsType<OkObjectResult>((await controller.CloseOrder(load.Id, order.Id,
            new(DeliveryStatus.Returned, PaymentMethod.None, 0, "Entrega não realizada; faltaram dois fardos no retorno", [new(item.Id, 0, 8)]), default)).Result);
        var link = await db.DeliveryLoadOrders.Include(x => x.ItemResults).SingleAsync();
        Assert.Equal("Conferente QA", link.CheckedBy); Assert.NotNull(link.DeliveredAt);
        Assert.Equal(8, link.ItemResults.Single().ReturnedQuantity); Assert.Equal(2, link.ItemResults.Single().MissingQuantity);
        Assert.Equal(13, await new InventoryService(db).BalanceAsync(product.Id, default));
        Assert.Equal(LoadStatus.Closed, load.Status);
        Assert.Null(load.ReturnedAt); // A conferência não inventa a hora de chegada.
        Assert.IsType<NoContentResult>(await controller.RecordReturn(load.Id, new(actualReturn.ToOffset(TimeSpan.FromHours(-3))), default));
        Assert.Equal(actualReturn, load.ReturnedAt); Assert.Equal(TimeSpan.Zero, load.ReturnedAt.GetValueOrDefault().Offset);
        Assert.Equal("Conferente QA", load.ReturnRecordedBy); Assert.NotNull(load.ReturnRecordedAt);
        Assert.True(load.ReturnedAt < link.DeliveredAt);
        Assert.IsType<ConflictObjectResult>(await controller.RecordReturn(load.Id, new(DateTimeOffset.UtcNow), default));
        Assert.Equal(actualReturn, load.ReturnedAt);
        Assert.Equal(13, await new InventoryService(db).BalanceAsync(product.Id, default));
    }

    [PostgresFact]
    public async Task ProductionPlan_DoesNotChangeStockUntilConfirmed_AndKeepsActualQuantities()
    {
        await using var database = await PostgresTestDatabase.CreateAsync();
        var db = database.Db;
        var (product, _, _) = await Seed(db, 1);
        var controller = new ProductionController(db);
        var request = new CreateProductionPlanRequest(Guid.NewGuid(), new DateOnly(2026, 11, 7), "Para expedição",
            [new(product.Id, 100)]);
        Assert.IsType<BadRequestObjectResult>(await controller.Create(request with { Items = [new(product.Id, 10), new(product.Id, 20)] }, default));
        Assert.IsType<BadRequestObjectResult>(await controller.Create(request with { ScheduledDate = null }, default));
        Assert.IsType<OkObjectResult>(await controller.Create(request, default));
        Assert.IsType<OkObjectResult>(await controller.Create(request, default));
        var plan = await db.ProductionPlans.Include(x => x.Items).SingleAsync();
        Assert.Empty(await db.StockMovements.ToListAsync());
        Assert.Equal(100, plan.Items.Single().PlannedQuantity);
        Assert.IsType<BadRequestObjectResult>(await controller.Complete(plan.Id, new(new DateOnly(2026, 11, 7), []), default));
        Assert.IsType<BadRequestObjectResult>(await controller.Complete(plan.Id, new(new DateOnly(2026, 11, 7), [new(product.Id, 0)]), default));
        Assert.IsType<OkObjectResult>(await controller.Complete(plan.Id, new(new DateOnly(2026, 11, 7), [new(product.Id, 90)]), default));
        Assert.Equal(90, await new InventoryService(db).BalanceAsync(product.Id, default));
        Assert.Equal(90, plan.Items.Single().ProducedQuantity);
        Assert.Equal(ProductionPlanStatus.Completed, plan.Status);
        Assert.NotNull(plan.CompletedAt);
        Assert.IsType<ConflictObjectResult>(await controller.Complete(plan.Id, new(new DateOnly(2026, 11, 7), [new(product.Id, 90)]), default));
        Assert.IsType<ConflictObjectResult>(await controller.Cancel(plan.Id, default));
        Assert.Equal(1, await db.StockMovements.CountAsync());
        Assert.IsType<OkObjectResult>(await controller.Create(request with { RequestId = Guid.NewGuid() }, default));
        var pending = await db.ProductionPlans.SingleAsync(x => x.Status == ProductionPlanStatus.Planned);
        Assert.IsType<NoContentResult>(await controller.Cancel(pending.Id, default));
        Assert.IsType<ConflictObjectResult>(await controller.Complete(pending.Id, new(new DateOnly(2026, 11, 7), [new(product.Id, 100)]), default));
        Assert.Equal(90, await new InventoryService(db).BalanceAsync(product.Id, default));
    }

    [PostgresFact]
    public async Task Production_AddsFinishedProductsOnce_AndRequiresQuantityAndDate()
    {
        await using var database = await PostgresTestDatabase.CreateAsync();
        var db = database.Db;
        var (product, _, _) = await Seed(db, 1);
        var controller = new InventoryController(db);
        var date = new DateOnly(2026, 11, 2);
        var request = new RecordStockRequest(Guid.NewGuid(), product.Id, StockMovementKind.Production, 50, "Produção Flokmel, turno da manhã", date);
        Assert.IsType<BadRequestObjectResult>(await controller.Record(request with { ProductionDate = null }, default));
        Assert.IsType<BadRequestObjectResult>(await controller.Record(request with { Quantity = 0 }, default));
        Assert.IsType<OkObjectResult>(await controller.Record(request, default));
        Assert.IsType<OkObjectResult>(await controller.Record(request, default));
        var movement = await db.StockMovements.SingleAsync();
        Assert.Equal(StockMovementKind.Production, movement.Kind);
        Assert.Equal(date, movement.ProductionDate);
        Assert.Equal(product.Unit, movement.Unit);
        Assert.Equal(50, await new InventoryService(db).BalanceAsync(product.Id, default));
        Assert.IsType<OkObjectResult>(await controller.Record(request with { RequestId = Guid.NewGuid(), Quantity = 25 }, default));
        Assert.Equal(75, await new InventoryService(db).BalanceAsync(product.Id, default));
    }

    [Fact]
    public void Reconciliation_RejectsDuplicateMissingAndExcessItems()
    {
        var item = new OrderItem { ProductCode = "A", ProductName = "Produto", Unit = "FD", Quantity = 10 };
        var link = new DeliveryLoadOrder { Order = new Order { Items = [item] } };
        Assert.Throws<InvalidOperationException>(() => InventoryService.Reconcile(link, []));
        Assert.Throws<InvalidOperationException>(() => InventoryService.Reconcile(link, [new(item.Id, 8, 3)]));
        Assert.Throws<InvalidOperationException>(() => InventoryService.Reconcile(link, [new(Guid.NewGuid(), 8, 2)]));
        Assert.Throws<InvalidOperationException>(() => InventoryService.Reconcile(link, [new(item.Id, 1.0001m, 0)]));
        var result = Assert.Single(InventoryService.Reconcile(link, [new(item.Id, 6, 3)]));
        Assert.Equal(1, result.MissingQuantity);
    }

    [PostgresFact]
    public async Task DispatchAndReturn_TrackOnlyPhysicalReturns_AndPreventDuplicateWrites()
    {
        await using var database = await PostgresTestDatabase.CreateAsync();
        var db = database.Db;
        var (product, load, order) = await Seed(db, 10);
        var stock = new InventoryController(db);
        var request = new RecordStockRequest(Guid.NewGuid(), product.Id, StockMovementKind.Count, 20, "Contagem inicial");
        Assert.IsType<OkObjectResult>(await stock.Record(request, default));
        Assert.IsType<OkObjectResult>(await stock.Record(request, default));
        Assert.Equal(1, await db.StockMovements.CountAsync());
        var loads = new DeliveryLoadsController(db);
        Assert.IsType<NoContentResult>(await loads.Dispatch(load.Id, default));
        Assert.Equal(10, await new InventoryService(db).BalanceAsync(product.Id, default));
        Assert.IsType<ConflictObjectResult>(await loads.Dispatch(load.Id, default));
        var item = order.Items.Single();
        Assert.IsType<BadRequestObjectResult>((await loads.CloseOrder(load.Id, order.Id,
            new(DeliveryStatus.PartiallyDelivered, PaymentMethod.Pix, 60, null, [new(item.Id, 6, 3)]), default)).Result);
        Assert.IsType<BadRequestObjectResult>((await loads.CloseOrder(load.Id, order.Id,
            new(DeliveryStatus.PartiallyDelivered, PaymentMethod.Pix, 61, "Um fardo faltante", [new(item.Id, 6, 3)]), default)).Result);
        Assert.Equal(2, await db.StockMovements.CountAsync());
        Assert.IsType<OkObjectResult>((await loads.CloseOrder(load.Id, order.Id,
            new(DeliveryStatus.PartiallyDelivered, PaymentMethod.Pix, 60, "Um fardo faltante", [new(item.Id, 6, 3)]), default)).Result);
        Assert.Equal(13, await new InventoryService(db).BalanceAsync(product.Id, default));
        var persisted = await db.DeliveryItemResults.SingleAsync();
        Assert.Equal(6, persisted.DeliveredQuantity); Assert.Equal(3, persisted.ReturnedQuantity); Assert.Equal(1, persisted.MissingQuantity);
        Assert.IsType<ConflictObjectResult>((await loads.CloseOrder(load.Id, order.Id,
            new(DeliveryStatus.Returned, PaymentMethod.None, 0, null, [new(item.Id, 0, 10)]), default)).Result);
        Assert.Equal(3, await db.StockMovements.CountAsync());
        Assert.Equal(LoadStatus.Closed, load.Status);
        Assert.IsType<OkObjectResult>(await stock.Record(new(Guid.NewGuid(), product.Id, StockMovementKind.Count, 12, "Ajuste após contagem física"), default));
        Assert.Equal(12, await new InventoryService(db).BalanceAsync(product.Id, default));
    }

    [PostgresFact]
    public async Task ConcurrentDispatches_CannotSpendTheSameStock()
    {
        await using var database = await PostgresTestDatabase.CreateAsync();
        var db = database.Db;
        var (product, first, _) = await Seed(db, 6);
        var (_, second, _) = await Seed(db, 6, product);
        Assert.IsType<OkObjectResult>(await new InventoryController(db).Record(
            new(Guid.NewGuid(), product.Id, StockMovementKind.Receipt, 10, "Compra de dez fardos"), default));
        async Task<bool> Dispatch(Guid id)
        {
            await using var context = new AppDbContext(database.Options);
            try { return await new DeliveryLoadsController(context).Dispatch(id, default) is NoContentResult; }
            catch (InvalidOperationException) { return false; }
        }
        var results = await Task.WhenAll(Dispatch(first.Id), Dispatch(second.Id));
        Assert.Single(results, x => x);
        Assert.Equal(4, await new InventoryService(db).BalanceAsync(product.Id, default));
        Assert.Equal(1, await db.DeliveryLoads.CountAsync(x => x.Status == LoadStatus.Dispatched));
        Assert.Equal(1, await db.StockMovements.CountAsync(x => x.Kind == StockMovementKind.Dispatch));
    }

    [PostgresFact]
    public async Task LegacyReturn_DoesNotInventStock_AndHistorySurvivesSecondMigration()
    {
        await using var database = await PostgresTestDatabase.CreateAsync();
        var db = database.Db;
        var (product, load, order) = await Seed(db, 5);
        load.Status = LoadStatus.Dispatched; // Carga que saiu antes da implantação do estoque.
        await db.SaveChangesAsync();
        Assert.IsType<OkObjectResult>((await new DeliveryLoadsController(db).CloseOrder(load.Id, order.Id,
            new(DeliveryStatus.Returned, PaymentMethod.None, 0, "Retorno histórico", [new(order.Items.Single().Id, 0, 5)]), default)).Result);
        Assert.Equal(0, await new InventoryService(db).BalanceAsync(product.Id, default));
        Assert.Equal(5, (await db.DeliveryItemResults.SingleAsync()).ReturnedQuantity);
        await db.Database.MigrateAsync();
        Assert.Equal(1, await db.DeliveryItemResults.CountAsync());
    }

    private static async Task<(Product product, DeliveryLoad load, Order order)> Seed(AppDbContext db, decimal quantity, Product? product = null)
    {
        var code = Guid.NewGuid().ToString("N");
        var region = new Region { Name = code };
        var seller = new Seller { Name = "Vendedor", Code = code };
        var customer = new Customer { LegalName = "Cliente QA", TaxId = code, Street = "Rua", Number = "1", District = "Centro",
            City = "São Paulo", State = "SP", PostalCode = "00000000", RegionId = region.Id, SellerId = seller.Id };
        product ??= new Product { Code = code, Name = "Produto QA", Unit = "FD", SalePrice = 10 };
        if (db.Entry(product).State == EntityState.Detached) db.Products.Add(product);
        var order = new Order { CustomerId = customer.Id, SellerId = seller.Id, TotalAmount = quantity * 10, Number = Random.Shared.NextInt64(),
            Items = [new OrderItem { ProductId = product.Id, ProductCode = product.Code, ProductName = product.Name, Unit = product.Unit,
                Quantity = quantity, UnitPrice = 10, TotalAmount = quantity * 10 }] };
        var load = new DeliveryLoad { Number = Random.Shared.NextInt64(), RegionId = region.Id, ScheduledDate = DateOnly.FromDateTime(DateTime.Today),
            Orders = [new DeliveryLoadOrder { Order = order }] };
        db.AddRange(region, seller, customer, load); await db.SaveChangesAsync();
        return (product, load, order);
    }
}
