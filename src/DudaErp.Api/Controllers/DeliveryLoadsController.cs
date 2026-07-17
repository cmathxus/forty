using DudaErp.Api.Contracts;
using DudaErp.Api.Data;
using DudaErp.Api.Domain;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace DudaErp.Api.Controllers;

[ApiController]
[Route("api/delivery-loads")]
public sealed class DeliveryLoadsController(AppDbContext dbContext) : ControllerBase
{
    [HttpPost]
    public async Task<ActionResult<DeliveryLoad>> Create(CreateDeliveryLoadRequest request, CancellationToken cancellationToken)
    {
        if (!await dbContext.Regions.AnyAsync(x => x.Id == request.RegionId && x.IsActive, cancellationToken))
            return BadRequest(new ValidationProblemDetails(new Dictionary<string, string[]> { ["regionId"] = ["Regiao invalida ou inativa."] }));

        if (request.VehicleId is not null &&
            !await dbContext.Vehicles.AnyAsync(x => x.Id == request.VehicleId && x.IsActive, cancellationToken))
            return BadRequest(new ValidationProblemDetails(new Dictionary<string, string[]> { ["vehicleId"] = ["Veiculo invalido ou inativo."] }));

        var load = new DeliveryLoad
        {
            Number = await NextNumberAsync(cancellationToken),
            ScheduledDate = request.ScheduledDate,
            RegionId = request.RegionId,
            VehicleId = request.VehicleId,
            DriverName = request.DriverName?.Trim(),
            Notes = request.Notes?.Trim()
        };

        dbContext.DeliveryLoads.Add(load);
        await dbContext.SaveChangesAsync(cancellationToken);

        if (request.OrderIds is { Count: > 0 })
        {
            await AddOrdersAsync(load, request.OrderIds, cancellationToken);
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        return CreatedAtAction(nameof(GetById), new { id = load.Id }, await LoadById(load.Id, cancellationToken));
    }

    [HttpGet]
    public Task<List<DeliveryLoad>> GetAll(DateOnly? date, CancellationToken cancellationToken)
    {
        var query = dbContext.DeliveryLoads.AsNoTracking()
            .Include(x => x.Region)
            .Include(x => x.Vehicle)
            .Include(x => x.Orders).ThenInclude(x => x.Order).ThenInclude(x => x!.Customer)
            .Include(x => x.Orders).ThenInclude(x => x.Order).ThenInclude(x => x!.Items)
            .AsQueryable();

        if (date is not null)
        {
            query = query.Where(x => x.ScheduledDate == date);
        }

        return query.OrderByDescending(x => x.ScheduledDate).ThenByDescending(x => x.Number).ToListAsync(cancellationToken);
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<DeliveryLoad>> GetById(Guid id, CancellationToken cancellationToken)
    {
        var load = await LoadById(id, cancellationToken);
        return load is null ? NotFound() : Ok(load);
    }

    [HttpPost("{id:guid}/orders")]
    public async Task<ActionResult<DeliveryLoad>> AddOrders(Guid id, AddOrdersToLoadRequest request, CancellationToken cancellationToken)
    {
        var load = await dbContext.DeliveryLoads.SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (load is null)
        {
            return NotFound();
        }

        try
        {
            await AddOrdersAsync(load, request.OrderIds, cancellationToken);
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (InvalidOperationException exception)
        {
            return BadRequest(new ValidationProblemDetails(new Dictionary<string, string[]> { ["orders"] = [exception.Message] }));
        }

        return Ok(await LoadById(id, cancellationToken));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<DeliveryLoad>> Update(Guid id, UpdateDeliveryLoadRequest request, CancellationToken cancellationToken)
    {
        var load = await dbContext.DeliveryLoads
            .Include(x => x.Orders)
            .SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (load is null) return NotFound();

        if (!await dbContext.Regions.AnyAsync(x => x.Id == request.RegionId && x.IsActive, cancellationToken))
            return BadRequest(new ValidationProblemDetails(new Dictionary<string, string[]> { ["regionId"] = ["Regiao invalida ou inativa."] }));

        if (request.VehicleId is not null &&
            !await dbContext.Vehicles.AnyAsync(x => x.Id == request.VehicleId && x.IsActive, cancellationToken))
            return BadRequest(new ValidationProblemDetails(new Dictionary<string, string[]> { ["vehicleId"] = ["Veiculo invalido ou inativo."] }));

        foreach (var item in load.Orders)
        {
            var order = await dbContext.Orders.SingleAsync(x => x.Id == item.OrderId, cancellationToken);
            if (order.Status is OrderStatus.Scheduled)
            {
                order.Status = OrderStatus.Confirmed;
            }
        }

        dbContext.DeliveryLoadOrders.RemoveRange(load.Orders);
        load.ScheduledDate = request.ScheduledDate;
        load.RegionId = request.RegionId;
        load.VehicleId = request.VehicleId;
        load.DriverName = request.DriverName?.Trim();
        load.Notes = request.Notes?.Trim();
        load.Status = LoadStatus.Open;
        load.UpdatedAt = DateTimeOffset.UtcNow;

        if (request.OrderIds is { Count: > 0 })
        {
            await AddOrdersAsync(load, request.OrderIds, cancellationToken, load.Id);
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return Ok(await LoadById(id, cancellationToken));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        var load = await dbContext.DeliveryLoads
            .Include(x => x.Orders)
            .SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (load is null) return NotFound();

        foreach (var item in load.Orders)
        {
            var order = await dbContext.Orders.SingleAsync(x => x.Id == item.OrderId, cancellationToken);
            if (order.Status is OrderStatus.Scheduled)
            {
                order.Status = OrderStatus.Confirmed;
            }
        }

        dbContext.DeliveryLoads.Remove(load);
        await dbContext.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [HttpPost("{loadId:guid}/orders/{orderId:guid}/close")]
    public async Task<ActionResult<DeliveryLoad>> CloseOrder(Guid loadId, Guid orderId, CloseDeliveryRequest request, CancellationToken cancellationToken)
    {
        var loadOrder = await dbContext.DeliveryLoadOrders
            .Include(x => x.Order)
            .SingleOrDefaultAsync(x => x.DeliveryLoadId == loadId && x.OrderId == orderId, cancellationToken);

        if (loadOrder is null)
        {
            return NotFound();
        }

        loadOrder.DeliveryStatus = request.DeliveryStatus;
        loadOrder.PaymentMethod = request.PaymentMethod;
        loadOrder.AmountReceived = request.AmountReceived;
        loadOrder.DeliveryNotes = request.DeliveryNotes?.Trim();
        loadOrder.DeliveredAt = DateTimeOffset.UtcNow;

        loadOrder.Order!.Status = request.DeliveryStatus switch
        {
            DeliveryStatus.Delivered => OrderStatus.Delivered,
            DeliveryStatus.PartiallyDelivered => OrderStatus.PartiallyDelivered,
            DeliveryStatus.Refused or DeliveryStatus.Returned => OrderStatus.Returned,
            _ => loadOrder.Order.Status
        };

        var hasPendingOrders = await dbContext.DeliveryLoadOrders
            .AnyAsync(x => x.DeliveryLoadId == loadId &&
                           x.OrderId != orderId &&
                           x.DeliveryStatus == DeliveryStatus.Pending, cancellationToken);

        if (!hasPendingOrders)
        {
            var load = await dbContext.DeliveryLoads.SingleAsync(x => x.Id == loadId, cancellationToken);
            load.Status = LoadStatus.Closed;
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return Ok(await LoadById(loadId, cancellationToken));
    }

    [HttpPost("{id:guid}/dispatch")]
    public async Task<IActionResult> Dispatch(Guid id, CancellationToken cancellationToken)
    {
        var load = await dbContext.DeliveryLoads
            .Include(x => x.Orders).ThenInclude(x => x.Order)
            .SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (load is null)
        {
            return NotFound();
        }

        load.Status = LoadStatus.Dispatched;
        foreach (var item in load.Orders)
        {
            item.Order!.Status = OrderStatus.Scheduled;
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [HttpGet("{id:guid}/summary")]
    public async Task<ActionResult<object>> Summary(Guid id, CancellationToken cancellationToken)
    {
        var load = await LoadById(id, cancellationToken);
        if (load is null)
        {
            return NotFound();
        }

        return Ok(new
        {
            load.Number,
            load.ScheduledDate,
            Region = load.Region?.Name,
            Vehicle = load.Vehicle is null ? null : $"{load.Vehicle.Name} - {load.Vehicle.Plate}",
            load.DriverName,
            Orders = load.Orders.Count,
            TotalAmount = load.Orders.Sum(x => x.Order?.TotalAmount ?? 0),
            ReceivedAmount = load.Orders.Sum(x => x.AmountReceived ?? 0),
            Pending = load.Orders.Count(x => x.DeliveryStatus == DeliveryStatus.Pending),
            Delivered = load.Orders.Count(x => x.DeliveryStatus == DeliveryStatus.Delivered),
            Returned = load.Orders.Count(x => x.DeliveryStatus is DeliveryStatus.Returned or DeliveryStatus.Refused)
        });
    }

    private async Task AddOrdersAsync(DeliveryLoad load, IReadOnlyCollection<Guid> orderIds, CancellationToken cancellationToken, Guid? ignoredLoadId = null)
    {
        var existingOrderIds = await dbContext.DeliveryLoadOrders
            .Where(x => orderIds.Contains(x.OrderId) && x.DeliveryLoadId != ignoredLoadId)
            .Select(x => x.OrderId)
            .ToListAsync(cancellationToken);
        if (existingOrderIds.Count > 0)
        {
            throw new InvalidOperationException("Um ou mais pedidos ja estao em outra carga.");
        }

        var orders = await dbContext.Orders
            .Include(x => x.Customer)
            .Where(x => orderIds.Contains(x.Id))
            .ToListAsync(cancellationToken);

        var missing = orderIds.Except(orders.Select(x => x.Id)).ToArray();
        if (missing.Length > 0)
        {
            throw new InvalidOperationException("Um ou mais pedidos nao foram encontrados.");
        }

        foreach (var order in orders)
        {
            if (order.Customer!.RegionId != load.RegionId)
            {
                throw new InvalidOperationException($"Pedido {order.Number} nao pertence a regiao da carga.");
            }

            dbContext.DeliveryLoadOrders.Add(new DeliveryLoadOrder
            {
                DeliveryLoadId = load.Id,
                OrderId = order.Id
            });
            order.Status = OrderStatus.Scheduled;
        }
    }

    private Task<DeliveryLoad?> LoadById(Guid id, CancellationToken cancellationToken) =>
        dbContext.DeliveryLoads.AsNoTracking()
            .Include(x => x.Region)
            .Include(x => x.Vehicle)
            .Include(x => x.Orders).ThenInclude(x => x.Order).ThenInclude(x => x!.Customer)
            .Include(x => x.Orders).ThenInclude(x => x.Order).ThenInclude(x => x!.Seller)
            .Include(x => x.Orders).ThenInclude(x => x.Order).ThenInclude(x => x!.Items)
            .SingleOrDefaultAsync(x => x.Id == id, cancellationToken);

    private async Task<long> NextNumberAsync(CancellationToken cancellationToken)
    {
        var lastNumber = await dbContext.DeliveryLoads.MaxAsync(x => (long?)x.Number, cancellationToken);
        return (lastNumber ?? 9889) + 1;
    }
}
