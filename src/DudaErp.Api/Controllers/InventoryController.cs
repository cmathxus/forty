using Microsoft.AspNetCore.Authorization;
using DudaErp.Api.Contracts;
using DudaErp.Api.Data;
using DudaErp.Api.Domain;
using DudaErp.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace DudaErp.Api.Controllers;

[ApiController]
[Authorize(Policy = "stock.read")]
[Route("api/inventory")]
public sealed class InventoryController(AppDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        var balances = await db.StockMovements.GroupBy(x => x.ProductId)
            .Select(x => new { Id = x.Key, Quantity = x.Sum(m => m.Quantity) }).ToDictionaryAsync(x => x.Id, x => x.Quantity, ct);
        var products = await db.Products.AsNoTracking().Where(x => x.IsActive).OrderBy(x => x.Code)
            .Select(x => new { x.Id, x.Code, x.Name, x.Unit }).ToListAsync(ct);
        var movements = await db.StockMovements.AsNoTracking().Where(x => User.IsInRole(AccessRules.Admin)).OrderByDescending(x => x.CreatedAt).Take(100)
            .Select(x => new { x.Id, x.ProductId, Code = x.Product!.Code, ProductName = x.Product.Name,
                x.Unit, x.Kind, x.Quantity, x.Reason, x.RecordedBy, x.CreatedAt, x.DeliveryLoadId, x.ProductionDate }).ToListAsync(ct);
        return Ok(new { Items = products.Select(x => new { x.Id, x.Code, x.Name, x.Unit,
            Quantity = balances.GetValueOrDefault(x.Id), HasHistory = balances.ContainsKey(x.Id) }), Movements = movements });
    }

    [HttpPost("movements")]
    [Authorize(Policy = "stock.manage")]
    public async Task<IActionResult> Record(RecordStockRequest request, CancellationToken ct)
    {
        if (request.RequestId == Guid.Empty || request.Kind is not (StockMovementKind.Receipt or StockMovementKind.Count or StockMovementKind.Production) ||
            string.IsNullOrWhiteSpace(request.Reason) || request.Reason.Trim().Length < 3 || request.Reason.Length > 500)
            return BadRequest(new { detail = "Informe produto, tipo de movimento e um motivo com pelo menos três caracteres." });
        InventoryService.ValidateQuantity(request.Quantity);
        if (request.Kind is StockMovementKind.Receipt or StockMovementKind.Production && request.Quantity == 0)
            return BadRequest(new { detail = "A quantidade de entrada ou produção deve ser maior que zero." });
        if (request.Kind == StockMovementKind.Production && request.ProductionDate is null)
            return BadRequest(new { detail = "Informe a data em que os produtos foram produzidos." });
        var inventory = new InventoryService(db);
        await using var transaction = await inventory.BeginWriteAsync(ct);
        var key = $"manual:{request.RequestId}";
        if (await db.StockMovements.AnyAsync(x => x.SourceKey == key, ct)) return Ok(new { alreadyRecorded = true });
        var product = await db.Products.SingleOrDefaultAsync(x => x.Id == request.ProductId && x.IsActive, ct);
        if (product is null) return BadRequest(new { detail = "Produto inválido ou inativo." });
        var balance = await inventory.BalanceAsync(product.Id, ct);
        db.StockMovements.Add(new StockMovement { ProductId = product.Id, Kind = request.Kind, Unit = product.Unit,
            Quantity = request.Kind == StockMovementKind.Count ? request.Quantity - balance : request.Quantity,
            Reason = request.Reason.Trim(), SourceKey = key, RecordedBy = User?.Identity?.Name ?? "Sistema",
            ProductionDate = request.Kind == StockMovementKind.Production ? request.ProductionDate : null });
        await db.SaveChangesAsync(ct);
        if (transaction is not null) await transaction.CommitAsync(ct);
        return Ok(new { balance = request.Kind == StockMovementKind.Count ? request.Quantity : balance + request.Quantity });
    }
}
