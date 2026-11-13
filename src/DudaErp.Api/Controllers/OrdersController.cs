using Microsoft.AspNetCore.Authorization;
using DudaErp.Api.Contracts;
using DudaErp.Api.Data;
using DudaErp.Api.Domain;
using DudaErp.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace DudaErp.Api.Controllers;

[ApiController]
[Route("api/orders")]
public sealed class OrdersController(AppDbContext dbContext, OrderService orderService) : ControllerBase
{
    [HttpPost]
    [Authorize(Policy = "orders.create")]
    public async Task<ActionResult<Order>> Create(CreateOrderRequest request, CancellationToken cancellationToken)
    {
        try
        {
            var order = await orderService.CreateAsync(request, cancellationToken);
            return CreatedAtAction(nameof(GetById), new { id = order.Id }, new
            {
                order.Id,
                order.Number,
                order.TotalAmount,
                order.TotalWeightInKg,
                order.Status
            });
        }
        catch (InvalidOperationException exception)
        {
            return BadRequest(new ValidationProblemDetails(
                new Dictionary<string, string[]> { ["order"] = [exception.Message] }));
        }
    }

    [HttpGet("{id:guid}")]
    [Authorize(Policy = "orders.lookup")]
    public async Task<ActionResult<Order>> GetById(Guid id, CancellationToken cancellationToken)
    {
        var order = await dbContext.Orders.AsNoTracking()
            .Include(x => x.Customer).ThenInclude(x => x!.Region)
            .Include(x => x.Seller)
            .Include(x => x.Items)
            .SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        return order is null ? NotFound() : Ok(order);
    }

    [HttpGet]
    [Authorize(Policy = "orders.lookup")]
    public Task<List<Order>> GetAll(CancellationToken cancellationToken) =>
        dbContext.Orders.AsNoTracking()
            .Include(x => x.Customer).ThenInclude(x => x!.Region)
            .Include(x => x.Seller)
            .Include(x => x.Items)
            .OrderByDescending(x => x.Number)
            .Take(100)
            .ToListAsync(cancellationToken);

    [HttpGet("page")]
    [Authorize(Policy = "orders.lookup")]
    public async Task<IActionResult> GetPage(CancellationToken cancellationToken,
        int page = 1, int pageSize = 100, OrderStatus? status = null)
    {
        if (page < 1 || pageSize is < 1 or > 200 || page > 1000000)
            return BadRequest(new { detail = "Página inválida. Use de 1 a 200 pedidos por página." });

        var query = dbContext.Orders.AsNoTracking();
        if (status is not null) query = query.Where(x => x.Status == status);
        var total = await query.CountAsync(cancellationToken);
        var items = await query.Include(x => x.Customer).ThenInclude(x => x!.Region)
            .Include(x => x.Seller).Include(x => x.Items)
            .AsSplitQuery().OrderByDescending(x => x.Number)
            .Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(cancellationToken);
        return Ok(new { items, total, page, pageSize });
    }

    [HttpPost("{id:guid}/approve")]
    [Authorize(Policy = "orders.approve")]
    public async Task<IActionResult> Approve(Guid id, CancellationToken ct)
    {
        if (!Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var actor)) return Unauthorized();
        await using var transaction = await new InventoryService(dbContext).BeginWriteAsync(ct);
        var order = await dbContext.Orders.SingleOrDefaultAsync(x => x.Id == id, ct);
        if (order is null) return NotFound();
        if (!order.RequiresCommercialWorkflow || order.ApprovedAt is not null || order.BilledAt is not null || order.Status != OrderStatus.Draft)
            return Conflict(new { detail = "Este pedido não está pendente de aprovação." });
        order.ApprovedAt = DateTimeOffset.UtcNow;
        order.ApprovedById = actor;
        order.ApprovedBy = User.Identity?.Name;
        order.Status = OrderStatus.Confirmed;
        await dbContext.SaveChangesAsync(ct);
        if (transaction is not null) await transaction.CommitAsync(ct);
        return NoContent();
    }

    [HttpPost("{id:guid}/bill")]
    [Authorize(Policy = "orders.bill")]
    public async Task<IActionResult> Bill(Guid id, CancellationToken ct)
    {
        var inventory = new InventoryService(dbContext);
        await using var transaction = await inventory.BeginWriteAsync(ct);
        var order = await dbContext.Orders.Include(x => x.Items).SingleOrDefaultAsync(x => x.Id == id, ct);
        if (order is null) return NotFound();
        if (order.BilledAt is not null) return NoContent();
        if (order.Status is not (OrderStatus.Draft or OrderStatus.Confirmed))
            return Conflict(new { detail = "Somente pedidos que ainda não entraram em uma carga podem ser faturados." });
        if (order.DueDate is null)
            return BadRequest(new { detail = "Informe o vencimento do pedido antes de faturar." });
        if (await dbContext.ProductionPlans.AnyAsync(x => x.OrderId == id && x.Status == ProductionPlanStatus.Planned, ct))
            return Conflict(new { detail = "Conclua ou cancele a produção vinculada antes de faturar." });
        if (await dbContext.AccountsReceivable.AnyAsync(x => x.OrderNumber == order.Number, ct))
            return Conflict(new { detail = "Já existe uma conta a receber vinculada a esse pedido." });
        await inventory.EnsureStockAsync(order.Items, ct);
        order.BilledAt = DateTimeOffset.UtcNow;
        order.Status = OrderStatus.Confirmed;
        dbContext.AccountsReceivable.Add(new AccountReceivable
        {
            Description = $"Venda do pedido {order.Number}",
            BilledOrderId = order.Id,
            OrderNumber = order.Number,
            CustomerId = order.CustomerId,
            DueDate = order.DueDate.Value,
            Amount = order.TotalAmount
        });
        await dbContext.SaveChangesAsync(ct);
        if (transaction is not null) await transaction.CommitAsync(ct);
        return NoContent();
    }

    [HttpPut("{id:guid}")]
    [Authorize(Policy = "orders.edit")]
    public async Task<ActionResult<Order>> Update(Guid id, CreateOrderRequest request, CancellationToken cancellationToken)
    {
        try
        {
            var order = await orderService.UpdateAsync(id, request, cancellationToken);
            return Ok(await dbContext.Orders.AsNoTracking()
                .Include(x => x.Customer).ThenInclude(x => x!.Region)
                .Include(x => x.Seller)
                .Include(x => x.Items)
                .SingleAsync(x => x.Id == order.Id, cancellationToken));
        }
        catch (InvalidOperationException exception)
        {
            return BadRequest(new ValidationProblemDetails(
                new Dictionary<string, string[]> { ["order"] = [exception.Message] }));
        }
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Policy = "orders.delete")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        await using var transaction = await new InventoryService(dbContext).BeginWriteAsync(cancellationToken);
        var order = await dbContext.Orders
            .Include(x => x.Items)
            .SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (order is null) return NotFound();

        if (order.Status is not (OrderStatus.Draft or OrderStatus.Confirmed) || order.BilledAt is not null ||
            await dbContext.ProductionPlans.AnyAsync(x => x.OrderId == id && x.Status != ProductionPlanStatus.Cancelled, cancellationToken) ||
            await dbContext.DeliveryLoadOrders.AnyAsync(x => x.OrderId == id, cancellationToken))
            return Conflict(new { detail = "O pedido só pode ser excluído antes do faturamento, da produção vinculada e da inclusão em carga." });
        if (await dbContext.AccountsReceivable.AnyAsync(x => x.OrderNumber == order.Number, cancellationToken))
            return Conflict(new { detail = "Este pedido possui lançamento financeiro e não pode ser excluído." });

        var loadLinks = await dbContext.DeliveryLoadOrders
            .Where(x => x.OrderId == id)
            .ToListAsync(cancellationToken);
        dbContext.DeliveryLoadOrders.RemoveRange(loadLinks);
        dbContext.Orders.Remove(order);
        await dbContext.SaveChangesAsync(cancellationToken);
        if (transaction is not null) await transaction.CommitAsync(cancellationToken);
        return NoContent();
    }

    [HttpGet("{id:guid}/vale")]
    [Authorize(Policy = "orders.lookup")]
    public async Task<ActionResult<object>> GetVale(Guid id, CancellationToken cancellationToken)
    {
        var order = await dbContext.Orders.AsNoTracking()
            .Include(x => x.Customer).ThenInclude(x => x!.Region)
            .Include(x => x.Seller)
            .Include(x => x.Items)
            .SingleOrDefaultAsync(x => x.Id == id, cancellationToken);

        if (order is null)
        {
            return NotFound();
        }

        var loadingNumber = await dbContext.DeliveryLoadOrders.AsNoTracking()
            .Where(x => x.OrderId == id)
            .Select(x => x.DeliveryLoad!.Number.ToString() + " - " + x.DeliveryLoad.Region!.Name)
            .SingleOrDefaultAsync(cancellationToken);

        return Ok(new
        {
            order.Number,
            LoadingNumber = loadingNumber,
            IssuedAt = order.CreatedAt,
            Customer = order.Customer,
            Seller = order.Seller,
            order.DueDate,
            order.PaymentCondition,
            order.TotalWeightInKg,
            order.TotalAmount,
            order.Items,
            Label = order.IsFiscalInvoiceRequested ? "Pedido para NF-e" : "Executado"
        });
    }
}
