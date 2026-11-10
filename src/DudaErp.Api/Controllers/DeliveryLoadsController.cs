using Microsoft.AspNetCore.Authorization;
using DudaErp.Api.Contracts;
using DudaErp.Api.Data;
using DudaErp.Api.Domain;
using DudaErp.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace DudaErp.Api.Controllers;

[ApiController]
[Authorize(Policy = "loads.manage")]
[Route("api/delivery-loads")]
public sealed class DeliveryLoadsController(AppDbContext dbContext) : ControllerBase
{
    [HttpPost]
    public async Task<ActionResult<DeliveryLoad>> Create(CreateDeliveryLoadRequest request, CancellationToken cancellationToken)
    {
        await using var numberingTransaction = dbContext.Database.IsNpgsql() && dbContext.Database.CurrentTransaction is null
            ? await dbContext.Database.BeginTransactionAsync(cancellationToken) : null;
        if (dbContext.Database.IsNpgsql())
            await dbContext.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(40670, 2)", cancellationToken);
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

        if (request.OrderIds is { Count: > 0 })
        {
            await AddOrdersAsync(load, request.OrderIds, cancellationToken);
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        if (numberingTransaction is not null) await numberingTransaction.CommitAsync(cancellationToken);

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
            .Include(x => x.Orders).ThenInclude(x => x.ItemResults)
            .AsSplitQuery()
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
            if (load.Status != LoadStatus.Open)
                return Conflict(new { detail = "Somente cargas abertas podem receber pedidos." });
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
            .Include(x => x.Orders).ThenInclude(x => x.Order)
            .SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (load is null) return NotFound();

        if (load.Status != LoadStatus.Open || load.Orders.Any(x => x.DeliveryStatus != DeliveryStatus.Pending))
            return Conflict(new { detail = "Cargas com saída ou baixa registrada não podem ser editadas." });

        if (!await dbContext.Regions.AnyAsync(x => x.Id == request.RegionId && x.IsActive, cancellationToken))
            return BadRequest(new ValidationProblemDetails(new Dictionary<string, string[]> { ["regionId"] = ["Regiao invalida ou inativa."] }));

        if (request.VehicleId is not null &&
            !await dbContext.Vehicles.AnyAsync(x => x.Id == request.VehicleId && x.IsActive, cancellationToken))
            return BadRequest(new ValidationProblemDetails(new Dictionary<string, string[]> { ["vehicleId"] = ["Veiculo invalido ou inativo."] }));

        var selectedIds = request.OrderIds?.Distinct().ToArray() ?? [];
        var retainedIds = load.Orders.Where(x => selectedIds.Contains(x.OrderId)).Select(x => x.OrderId).ToArray();
        var removedLinks = load.Orders.Where(x => !selectedIds.Contains(x.OrderId)).ToArray();
        foreach (var item in removedLinks)
        {
            var order = item.Order!;
            if (order.Status is OrderStatus.Scheduled)
            {
                order.Status = OrderStatus.Confirmed;
            }
        }

        dbContext.DeliveryLoadOrders.RemoveRange(removedLinks);
        load.ScheduledDate = request.ScheduledDate;
        load.RegionId = request.RegionId;
        load.VehicleId = request.VehicleId;
        load.DriverName = request.DriverName?.Trim();
        load.Notes = request.Notes?.Trim();
        load.Status = LoadStatus.Open;
        load.UpdatedAt = DateTimeOffset.UtcNow;

        var addedIds = selectedIds.Except(retainedIds).ToArray();
        if (addedIds.Length > 0)
        {
            await AddOrdersAsync(load, addedIds, cancellationToken, load.Id);
        }

        if (retainedIds.Length > 0 && await dbContext.Orders.Include(x => x.Customer)
            .AnyAsync(x => retainedIds.Contains(x.Id) && x.Customer!.RegionId != load.RegionId, cancellationToken))
            return BadRequest(new { detail = "Os pedidos selecionados devem pertencer à região da carga." });

        await dbContext.SaveChangesAsync(cancellationToken);
        return Ok(await LoadById(id, cancellationToken));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        var load = await dbContext.DeliveryLoads
            .Include(x => x.Orders).ThenInclude(x => x.Order)
            .SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (load is null) return NotFound();

        if (load.Status != LoadStatus.Open || load.Orders.Any(x => x.DeliveryStatus != DeliveryStatus.Pending))
            return Conflict(new { detail = "Cargas com saída ou baixa registrada não podem ser excluídas." });

        foreach (var item in load.Orders)
        {
            var order = item.Order!;
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
        var inventory = new InventoryService(dbContext);
        await using var transaction = await inventory.BeginWriteAsync(cancellationToken);
        var loadOrder = await dbContext.DeliveryLoadOrders
            .Include(x => x.Order).ThenInclude(x => x!.Items)
            .Include(x => x.ItemResults)
            .SingleOrDefaultAsync(x => x.DeliveryLoadId == loadId && x.OrderId == orderId, cancellationToken);

        if (loadOrder is null)
        {
            return NotFound();
        }

        var deliveryLoad = await dbContext.DeliveryLoads.SingleAsync(x => x.Id == loadId, cancellationToken);
        if (deliveryLoad.Status != LoadStatus.Dispatched || loadOrder.DeliveryStatus != DeliveryStatus.Pending)
            return Conflict(new { detail = "A baixa exige uma carga na rua e um pedido ainda pendente." });
        if (!Enum.IsDefined(request.DeliveryStatus) || request.DeliveryStatus == DeliveryStatus.Pending ||
            !Enum.IsDefined(request.PaymentMethod))
            return BadRequest(new { detail = "Informe uma situação de entrega e uma forma de pagamento válidas." });
        if (request.AmountReceived < 0 || request.AmountReceived > loadOrder.Order!.TotalAmount ||
            (request.DeliveryStatus is DeliveryStatus.Returned or DeliveryStatus.Refused && request.AmountReceived > 0) ||
            (request.AmountReceived > 0 && request.PaymentMethod == PaymentMethod.None))
            return BadRequest(new { detail = "Revise o valor recebido e a forma de pagamento." });

        if (request.Items is null)
            return BadRequest(new { detail = "Confira as quantidades entregues e devolvidas de cada produto." });
        if (request.Items is not null)
        {
            var results = InventoryService.Reconcile(loadOrder, request.Items);
            var allDelivered = results.All(x => x.DeliveredQuantity == loadOrder.Order!.Items.Single(i => i.Id == x.OrderItemId).Quantity);
            var anyDelivered = results.Any(x => x.DeliveredQuantity > 0);
            if ((request.DeliveryStatus == DeliveryStatus.Delivered && !allDelivered) ||
                (request.DeliveryStatus == DeliveryStatus.PartiallyDelivered && (!anyDelivered || allDelivered)) ||
                (request.DeliveryStatus is DeliveryStatus.Returned or DeliveryStatus.Refused && anyDelivered))
                return BadRequest(new { detail = "A situação da entrega não corresponde às quantidades conferidas." });
            if (results.Any(x => x.MissingQuantity > 0) && string.IsNullOrWhiteSpace(request.DeliveryNotes))
                return BadRequest(new { detail = "Descreva a divergência antes de registrar produtos faltantes." });
            var deliveredAmount = decimal.Round(results.Sum(x => {
                var original = loadOrder.Order!.Items.Single(i => i.Id == x.OrderItemId);
                return original.TotalAmount * x.DeliveredQuantity / original.Quantity;
            }), 2, MidpointRounding.AwayFromZero);
            if (request.AmountReceived > deliveredAmount)
                return BadRequest(new { detail = "O valor recebido não pode superar o valor dos itens entregues." });
            loadOrder.ItemResults = results;
            dbContext.DeliveryItemResults.AddRange(results);
            inventory.RecordReturns(deliveryLoad, loadOrder, User?.Identity?.Name ?? "Sistema");
        }

        loadOrder.DeliveryStatus = request.DeliveryStatus;
        loadOrder.PaymentMethod = request.PaymentMethod;
        loadOrder.AmountReceived = request.AmountReceived;
        loadOrder.DeliveryNotes = request.DeliveryNotes?.Trim();
        loadOrder.DeliveredAt = DateTimeOffset.UtcNow;
        loadOrder.CheckedBy = User?.Identity?.Name ?? "Sistema";

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
        if (transaction is not null) await transaction.CommitAsync(cancellationToken);
        return Ok(await LoadById(loadId, cancellationToken));
    }

    [HttpPost("{id:guid}/dispatch")]
    public async Task<IActionResult> Dispatch(Guid id, CancellationToken cancellationToken)
    {
        var inventory = new InventoryService(dbContext);
        await using var transaction = await inventory.BeginWriteAsync(cancellationToken);
        var load = await dbContext.DeliveryLoads
            .Include(x => x.Orders).ThenInclude(x => x.Order).ThenInclude(x => x!.Items)
            .SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (load is null)
        {
            return NotFound();
        }

        if (load.Status != LoadStatus.Open || load.Orders.Count == 0 ||
            load.Orders.Any(x => x.DeliveryStatus != DeliveryStatus.Pending))
            return Conflict(new { detail = "Somente uma carga aberta, com pedidos pendentes, pode sair para entrega." });

        await inventory.RecordDispatchAsync(load, User?.Identity?.Name ?? "Sistema", cancellationToken);
        load.Status = LoadStatus.Dispatched;
        load.DispatchedAt = DateTimeOffset.UtcNow;
        load.DispatchedBy = User?.Identity?.Name ?? "Sistema";
        foreach (var item in load.Orders)
        {
            item.Order!.Status = OrderStatus.Scheduled;
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        if (transaction is not null) await transaction.CommitAsync(cancellationToken);
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
            if (order.Status != OrderStatus.Confirmed)
                throw new InvalidOperationException($"Pedido {order.Number} não está confirmado para inclusão em carga.");
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
            .Include(x => x.Orders).ThenInclude(x => x.ItemResults)
            .AsSplitQuery()
            .SingleOrDefaultAsync(x => x.Id == id, cancellationToken);

    private async Task<long> NextNumberAsync(CancellationToken cancellationToken)
    {
        var lastNumber = await dbContext.DeliveryLoads.MaxAsync(x => (long?)x.Number, cancellationToken);
        return (lastNumber ?? 9889) + 1;
    }
}
