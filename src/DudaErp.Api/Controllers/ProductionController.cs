using Microsoft.AspNetCore.Authorization;
using DudaErp.Api.Contracts;
using DudaErp.Api.Data;
using DudaErp.Api.Domain;
using DudaErp.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace DudaErp.Api.Controllers;

[ApiController]
[Route("api/production")]
public sealed class ProductionController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    [Authorize(Policy = "production.read")]
    public Task<List<ProductionPlan>> Get(CancellationToken ct) => db.ProductionPlans.AsNoTracking().Include(x => x.Items)
        .OrderBy(x => x.Status).ThenByDescending(x => x.Number).Take(200).ToListAsync(ct);

    [HttpPost]
    [Authorize(Policy = "production.create")]
    public async Task<IActionResult> Create(CreateProductionPlanRequest request, CancellationToken ct)
    {
        if (request.RequestId == Guid.Empty || request.ScheduledDate is null || request.Items is null || request.Items.Count is 0 or > 100 ||
            request.Items.Select(x => x.ProductId).Distinct().Count() != request.Items.Count)
            return BadRequest(new { detail = "Informe a data e de 1 a 100 produtos, sem repetir produtos." });
        foreach (var item in request.Items)
        {
            InventoryService.ValidateQuantity(item.Quantity);
            if (item.Quantity == 0) return BadRequest(new { detail = "A quantidade a produzir deve ser maior que zero." });
        }
        await using var transaction = await new InventoryService(db).BeginWriteAsync(ct);
        var existing = await db.ProductionPlans.AsNoTracking().Include(x => x.Items).SingleOrDefaultAsync(x => x.RequestId == request.RequestId, ct);
        if (existing is not null) return Ok(existing);
        Order? order = null;
        if (request.OrderNumber is not null)
        {
            order = await db.Orders.Include(x => x.Items).SingleOrDefaultAsync(x => x.Number == request.OrderNumber, ct);
            if (order is null || order.ApprovedAt is null || order.BilledAt is not null || order.Status != OrderStatus.Confirmed)
                return Conflict(new { detail = "Para programar a produção de um pedido, use um pedido aprovado pelo Financeiro e ainda não faturado." });
            if (request.Items.Any(item => order.Items.All(line => line.ProductId != item.ProductId)))
                return BadRequest(new { detail = "A produção vinculada deve usar produtos do pedido." });
            if (await db.ProductionPlans.AnyAsync(x => x.OrderId == order.Id && x.Status == ProductionPlanStatus.Planned, ct))
                return Conflict(new { detail = "Este pedido já tem uma programação de produção pendente." });
        }
        var ids = request.Items.Select(x => x.ProductId).ToArray();
        var products = await db.Products.Where(x => ids.Contains(x.Id) && x.IsActive).ToDictionaryAsync(x => x.Id, ct);
        if (products.Count != ids.Length) return BadRequest(new { detail = "Um produto não foi encontrado ou está inativo." });
        var plan = new ProductionPlan { RequestId = request.RequestId, Number = (await db.ProductionPlans.MaxAsync(x => (long?)x.Number, ct) ?? 0) + 1,
            OrderId = order?.Id, OrderNumber = order?.Number,
            ScheduledDate = request.ScheduledDate.Value, Notes = request.Notes?.Trim(), CreatedBy = User?.Identity?.Name ?? "Sistema",
            Items = request.Items.Select(x => new ProductionPlanItem { ProductId = x.ProductId, ProductCode = products[x.ProductId].Code,
                ProductName = products[x.ProductId].Name, Unit = products[x.ProductId].Unit, PlannedQuantity = x.Quantity }).ToList() };
        db.ProductionPlans.Add(plan);
        await db.SaveChangesAsync(ct);
        if (transaction is not null) await transaction.CommitAsync(ct);
        return Ok(plan);
    }

    [HttpPost("{id:guid}/complete")]
    [Authorize(Policy = "production.complete")]
    public async Task<IActionResult> Complete(Guid id, CompleteProductionPlanRequest request, CancellationToken ct)
    {
        await using var transaction = await new InventoryService(db).BeginWriteAsync(ct);
        var plan = await db.ProductionPlans.Include(x => x.Items).SingleOrDefaultAsync(x => x.Id == id, ct);
        if (plan is null) return NotFound();
        if (plan.Status != ProductionPlanStatus.Planned) return Conflict(new { detail = "Esta programação já foi concluída ou cancelada." });
        if (request.ProductionDate is null || request.Items is null || request.Items.Count != plan.Items.Count ||
            request.Items.Select(x => x.ProductId).Distinct().Count() != request.Items.Count ||
            request.Items.Any(x => plan.Items.All(i => i.ProductId != x.ProductId)))
            return BadRequest(new { detail = "Informe a data de produção e a quantidade real de todos os produtos da lista." });
        foreach (var item in request.Items) InventoryService.ValidateQuantity(item.Quantity);
        if (request.Items.All(x => x.Quantity == 0)) return BadRequest(new { detail = "Nenhum produto foi produzido. Cancele a programação se ela não for realizada." });
        var ids = plan.Items.Select(x => x.ProductId).ToArray();
        var products = await db.Products.Where(x => ids.Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
        if (plan.Items.Any(x => !products.TryGetValue(x.ProductId, out var product) || !product.IsActive || product.Unit != x.Unit))
            return Conflict(new { detail = "Um produto está inativo ou mudou de unidade. Revise o cadastro antes de concluir a produção." });
        var actor = User?.Identity?.Name ?? "Sistema";
        foreach (var item in plan.Items)
        {
            var quantity = request.Items.Single(x => x.ProductId == item.ProductId).Quantity;
            item.ProducedQuantity = quantity;
            if (quantity > 0) db.StockMovements.Add(new StockMovement { ProductId = item.ProductId, Unit = item.Unit,
                Kind = StockMovementKind.Production, Quantity = quantity, ProductionDate = request.ProductionDate,
                Reason = $"Produção da programação {plan.Number}", RecordedBy = actor, SourceKey = $"production:{plan.Id}:{item.ProductId}" });
        }
        plan.Status = ProductionPlanStatus.Completed; plan.CompletedAt = DateTimeOffset.UtcNow;
        plan.ProductionDate = request.ProductionDate; plan.CompletedBy = actor; plan.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        if (transaction is not null) await transaction.CommitAsync(ct);
        return Ok(plan);
    }

    [HttpPost("{id:guid}/cancel")]
    [Authorize(Policy = "production.cancel")]
    public async Task<IActionResult> Cancel(Guid id, CancellationToken ct)
    {
        await using var transaction = await new InventoryService(db).BeginWriteAsync(ct);
        var plan = await db.ProductionPlans.SingleOrDefaultAsync(x => x.Id == id, ct);
        if (plan is null) return NotFound();
        if (plan.Status != ProductionPlanStatus.Planned) return Conflict(new { detail = "Somente uma programação pendente pode ser cancelada." });
        plan.Status = ProductionPlanStatus.Cancelled; plan.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        if (transaction is not null) await transaction.CommitAsync(ct);
        return NoContent();
    }
}
