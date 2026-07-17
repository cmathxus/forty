using DudaErp.Api.Contracts;
using DudaErp.Api.Data;
using DudaErp.Api.Domain;
using DudaErp.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace DudaErp.Api.Controllers;

[ApiController]
[Route("api/orders")]
public sealed class OrdersController(AppDbContext dbContext, OrderService orderService) : ControllerBase
{
    [HttpPost]
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

    [HttpPut("{id:guid}")]
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
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        var order = await dbContext.Orders
            .Include(x => x.Items)
            .SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (order is null) return NotFound();

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
            order.TotalWeightInKg,
            order.TotalAmount,
            order.Items,
            Label = order.IsFiscalInvoiceRequested ? "Pedido para NF-e" : "Vale interno"
        });
    }
}
