using DudaErp.Api.Contracts;
using DudaErp.Api.Data;
using DudaErp.Api.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;

namespace DudaErp.Api.Services;

public sealed class InventoryService(AppDbContext db)
{
    // Todas as operações de saldo e baixas usam o mesmo lock transacional.
    public async Task<IDbContextTransaction?> BeginWriteAsync(CancellationToken ct)
    {
        if (!db.Database.IsNpgsql()) return null;
        var transaction = db.Database.CurrentTransaction is null ? await db.Database.BeginTransactionAsync(ct) : null;
        try { await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(40670, 3)", ct); }
        catch { if (transaction is not null) await transaction.DisposeAsync(); throw; }
        return transaction;
    }

    public Task<decimal> BalanceAsync(Guid productId, CancellationToken ct) => db.StockMovements
        .Where(x => x.ProductId == productId).SumAsync(x => x.Quantity, ct);

    public static void ValidateQuantity(decimal quantity)
    {
        if (quantity < 0 || quantity > 999999999999m || decimal.Round(quantity, 3) != quantity)
            throw new InvalidOperationException("Informe uma quantidade válida, com até três casas decimais.");
    }

    public async Task EnsureStockAsync(IEnumerable<OrderItem> items, CancellationToken ct)
    {
        var groups = items.GroupBy(x => x.ProductId).ToArray();
        if (groups.Length == 0) throw new InvalidOperationException("Informe pelo menos um item.");
        var ids = groups.Select(x => x.Key).ToArray();
        var products = await db.Products.Where(x => ids.Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
        var balances = await db.StockMovements.Where(x => ids.Contains(x.ProductId)).GroupBy(x => x.ProductId)
            .Select(x => new { Id = x.Key, Quantity = x.Sum(m => m.Quantity) }).ToDictionaryAsync(x => x.Id, x => x.Quantity, ct);
        var currentOrders = groups.SelectMany(group => group).Select(item => item.OrderId).Distinct().ToArray();
        var reserved = await db.OrderItems
            .Where(item => ids.Contains(item.ProductId) && !currentOrders.Contains(item.OrderId) && item.Order!.BilledAt != null &&
                (item.Order.Status == OrderStatus.Confirmed ||
                 (item.Order.Status == OrderStatus.Scheduled && db.DeliveryLoadOrders.Any(link =>
                     link.OrderId == item.OrderId && link.DeliveryLoad!.Status == LoadStatus.Open))))
            .GroupBy(item => item.ProductId)
            .Select(group => new { Id = group.Key, Quantity = group.Sum(item => item.Quantity) })
            .ToDictionaryAsync(item => item.Id, item => item.Quantity, ct);
        foreach (var group in groups)
        {
            var first = group.First();
            if (!products.TryGetValue(group.Key, out var product) || !product.IsActive || group.Any(x => x.Unit != product.Unit))
                throw new InvalidOperationException($"Revise o produto {first.ProductCode}: ele está inativo ou a unidade do pedido difere do cadastro.");
            var needed = group.Sum(x => x.Quantity);
            var available = balances.GetValueOrDefault(group.Key) - reserved.GetValueOrDefault(group.Key);
            if (available < needed)
                throw new InvalidOperationException($"Estoque insuficiente para {first.ProductCode} — {first.ProductName}. Disponível após reservas: {Math.Max(0, available):0.###} {first.Unit}. Necessário: {needed:0.###}.");
        }
    }

    public async Task RecordDispatchAsync(DeliveryLoad load, string actor, CancellationToken ct)
    {
        var items = load.Orders.SelectMany(x => x.Order!.Items).ToArray();
        await EnsureStockAsync(items, ct);
        var groups = items.GroupBy(x => x.ProductId);
        foreach (var group in groups)
            db.StockMovements.Add(new StockMovement { ProductId = group.Key, Kind = StockMovementKind.Dispatch,
                Quantity = -group.Sum(x => x.Quantity), Unit = group.First().Unit, Reason = $"Saída da carga {load.Number}",
                RecordedBy = actor, DeliveryLoadId = load.Id, SourceKey = $"dispatch:{load.Id}:{group.Key}" });
        load.InventoryTracked = true;
    }

    public static List<DeliveryItemResult> Reconcile(DeliveryLoadOrder link, IReadOnlyCollection<DeliveryItemResultRequest> items)
    {
        var expected = link.Order!.Items;
        if (items.Count != expected.Count || items.Select(x => x.OrderItemId).Distinct().Count() != items.Count ||
            items.Any(x => expected.All(e => e.Id != x.OrderItemId)))
            throw new InvalidOperationException("Confira todos os itens do pedido, sem itens extras ou duplicados.");
        return items.Select(input => {
            ValidateQuantity(input.DeliveredQuantity); ValidateQuantity(input.ReturnedQuantity);
            var original = expected.Single(x => x.Id == input.OrderItemId);
            var missing = original.Quantity - input.DeliveredQuantity - input.ReturnedQuantity;
            if (missing < 0) throw new InvalidOperationException($"Entregue + devolvido não pode superar a saída do produto {original.ProductCode}.");
            return new DeliveryItemResult { DeliveryLoadOrderId = link.Id, OrderItemId = input.OrderItemId,
                DeliveredQuantity = input.DeliveredQuantity, ReturnedQuantity = input.ReturnedQuantity, MissingQuantity = missing };
        }).ToList();
    }

    public void RecordReturns(DeliveryLoad load, DeliveryLoadOrder link, string actor)
    {
        if (!load.InventoryTracked) return; // Cargas históricas não tiveram débito de estoque.
        var returned = link.ItemResults.Where(x => x.ReturnedQuantity > 0)
            .GroupBy(x => link.Order!.Items.Single(i => i.Id == x.OrderItemId).ProductId);
        foreach (var group in returned)
            db.StockMovements.Add(new StockMovement { ProductId = group.Key, Kind = StockMovementKind.Return,
                Quantity = group.Sum(x => x.ReturnedQuantity), Unit = link.Order!.Items.First(x => x.ProductId == group.Key).Unit,
                Reason = $"Devolução da carga {load.Number}, pedido {link.Order!.Number}", RecordedBy = actor,
                DeliveryLoadId = load.Id, SourceKey = $"return:{link.Id}:{group.Key}" });
    }
}
