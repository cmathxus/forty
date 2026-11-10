using Microsoft.AspNetCore.Authorization;
using DudaErp.Api.Contracts;
using DudaErp.Api.Data;
using DudaErp.Api.Domain;
using DudaErp.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace DudaErp.Api.Controllers;

[ApiController]
[Authorize(Policy = "orders.read")]
[Route("api/orders")]
public sealed class OrdersController(AppDbContext dbContext, OrderService orderService) : ControllerBase
{
    [HttpPost]
    [Authorize(Policy = "orders.manage")]
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
    public Task<List<Order>> GetAll(CancellationToken cancellationToken) =>
        dbContext.Orders.AsNoTracking()
            .Include(x => x.Customer).ThenInclude(x => x!.Region)
            .Include(x => x.Seller)
            .Include(x => x.Items)
            .OrderByDescending(x => x.Number)
            .Take(100)
            .ToListAsync(cancellationToken);

    [HttpGet("page")]
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

    [HttpPut("{id:guid}")]
    [Authorize(Policy = "orders.manage")]
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
    [Authorize(Policy = "orders.manage")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        var order = await dbContext.Orders
            .Include(x => x.Items)
            .SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (order is null) return NotFound();

        if (order.Status != OrderStatus.Confirmed ||
            await dbContext.DeliveryLoadOrders.AnyAsync(x => x.OrderId == id, cancellationToken))
            return Conflict(new { detail = "Somente pedidos confirmados e sem carga podem ser excluídos." });
        if (await dbContext.AccountsReceivable.AnyAsync(x => x.OrderNumber == order.Number, cancellationToken))
            return Conflict(new { detail = "Este pedido possui lançamento financeiro e não pode ser excluído." });

        var loadLinks = await dbContext.DeliveryLoadOrders
            .Where(x => x.OrderId == id)
            .ToListAsync(cancellationToken);
        dbContext.DeliveryLoadOrders.RemoveRange(loadLinks);
        dbContext.Orders.Remove(order);
        await dbContext.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [HttpGet("{id:guid}/vale")]
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
