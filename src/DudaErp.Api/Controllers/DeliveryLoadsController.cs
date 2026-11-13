using Microsoft.AspNetCore.Authorization;
using DudaErp.Api.Contracts;
using DudaErp.Api.Data;
using DudaErp.Api.Domain;
using DudaErp.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace DudaErp.Api.Controllers;

[ApiController]
[Route("api/delivery-loads")]
public sealed class DeliveryLoadsController(AppDbContext dbContext) : ControllerBase
{
    [HttpPost]
    [Authorize(Policy = "loads.create")]
    public async Task<ActionResult<DeliveryLoad>> Create(CreateDeliveryLoadRequest request, CancellationToken cancellationToken)
    {
        await using var numberingTransaction = await new InventoryService(dbContext).BeginWriteAsync(cancellationToken);
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
    [Authorize(Policy = "loads.read")]
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

    [HttpGet("page")]
    [Authorize(Policy = "loads.read")]
    public async Task<IActionResult> GetPage([FromQuery] LoadPageQuery request, CancellationToken ct)
    {
        var query = dbContext.DeliveryLoads.AsNoTracking();
        query = request.Stage switch {
            0 => query.Where(x => x.Status == LoadStatus.Open),
            1 => query.Where(x => x.Status == LoadStatus.Dispatched && x.ReturnedAt == null),
            2 => query.Where(x => x.Status == LoadStatus.Dispatched && x.ReturnedAt != null),
            3 => query.Where(x => x.Status == LoadStatus.Closed), _ => query
        };
        if (request.RegionId is { } region) query = query.Where(x => x.RegionId == region);
        if (request.VehicleId is { } vehicle) query = query.Where(x => x.VehicleId == vehicle);
        if (request.From is { } from) query = query.Where(x => x.ScheduledDate >= from);
        if (request.To is { } to) query = query.Where(x => x.ScheduledDate <= to);
        if (request.Shortages) query = query.Where(x => x.Orders.Any(o => o.ItemResults.Any(i => i.MissingQuantity > 0)));
        if (!string.IsNullOrWhiteSpace(request.Driver))
        {
            var pattern = new PageQuery { Search = request.Driver }.Pattern;
            query = query.Where(x => EF.Functions.ILike(x.DriverName ?? "", pattern, "\\"));
        }
        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var pattern = new PageQuery { Search = request.Search }.Pattern;
            query = query.Where(x => EF.Functions.ILike(x.Number.ToString(), pattern, "\\") ||
                EF.Functions.ILike(x.Region!.Name, pattern, "\\") || EF.Functions.ILike(x.DriverName ?? "", pattern, "\\") ||
                EF.Functions.ILike(x.Vehicle!.Plate, pattern, "\\") || EF.Functions.ILike(x.Vehicle.Name, pattern, "\\") ||
                x.Orders.Any(o => EF.Functions.ILike(o.Order!.Number.ToString(), pattern, "\\") ||
                    EF.Functions.ILike(o.Order.Customer!.LegalName, pattern, "\\") || EF.Functions.ILike(o.Order.Customer.TradeName ?? "", pattern, "\\") ||
                    EF.Functions.ILike(o.Order.Customer.City, pattern, "\\") || EF.Functions.ILike(o.Order.Customer.State, pattern, "\\") ||
                    EF.Functions.ILike(o.Order.Customer.District, pattern, "\\") || EF.Functions.ILike(o.Order.Customer.Street, pattern, "\\")));
        }
        return Ok(await query.Include(x => x.Region).Include(x => x.Vehicle)
            .Include(x => x.Orders).ThenInclude(x => x.Order).ThenInclude(x => x!.Customer)
            .Include(x => x.Orders).ThenInclude(x => x.Order).ThenInclude(x => x!.Items)
            .Include(x => x.Orders).ThenInclude(x => x.ItemResults).AsSplitQuery()
            .OrderByDescending(x => x.ScheduledDate).ThenByDescending(x => x.Number).ThenBy(x => x.Id)
            .ReadPageAsync(new() { Page = request.Page }, ct));
    }

    [HttpGet("filter-options")]
    [Authorize(Policy = "loads.read")]
    public async Task<IActionResult> FilterOptions(CancellationToken ct) => Ok(new {
        regions = await dbContext.DeliveryLoads.Select(x => x.Region!).Distinct().OrderBy(x => x.Name).Select(x => new { x.Id, x.Name }).ToListAsync(ct),
        vehicles = await dbContext.DeliveryLoads.Where(x => x.VehicleId != null).Select(x => x.Vehicle!).Distinct().OrderBy(x => x.Name).Select(x => new { x.Id, x.Name, x.Plate }).ToListAsync(ct)
    });

    [HttpGet("summary")]
    [Authorize(Policy = "loads.read")]
    public async Task<IActionResult> Summary(CancellationToken ct) => Ok(new {
        preparing = await dbContext.DeliveryLoads.CountAsync(x => x.Status == LoadStatus.Open, ct),
        onRoute = await dbContext.DeliveryLoads.CountAsync(x => x.Status == LoadStatus.Dispatched && x.ReturnedAt == null, ct),
        recentOnRoute = await dbContext.DeliveryLoads.Where(x => x.Status == LoadStatus.Dispatched && x.ReturnedAt == null)
            .OrderByDescending(x => x.Number).Take(3).Select(x => new { x.Number, region = new { x.Region!.Name }, orderCount = x.Orders.Count }).ToListAsync(ct)
    });

    [HttpGet("{id:guid}")]
    [Authorize(Policy = "loads.read")]
    public async Task<ActionResult<DeliveryLoad>> GetById(Guid id, CancellationToken cancellationToken)
    {
        var load = await LoadById(id, cancellationToken);
        return load is null ? NotFound() : Ok(load);
    }

    [HttpPost("{id:guid}/orders")]
    [Authorize(Policy = "loads.edit")]
    public async Task<ActionResult<DeliveryLoad>> AddOrders(Guid id, AddOrdersToLoadRequest request, CancellationToken cancellationToken)
    {
        await using var transaction = await new InventoryService(dbContext).BeginWriteAsync(cancellationToken);
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

        if (transaction is not null) await transaction.CommitAsync(cancellationToken);
        return Ok(await LoadById(id, cancellationToken));
    }

    [HttpPut("{id:guid}")]
    [Authorize(Policy = "loads.edit")]
    public async Task<ActionResult<DeliveryLoad>> Update(Guid id, UpdateDeliveryLoadRequest request, CancellationToken cancellationToken)
    {
        await using var transaction = await new InventoryService(dbContext).BeginWriteAsync(cancellationToken);
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
        if (transaction is not null) await transaction.CommitAsync(cancellationToken);
        return Ok(await LoadById(id, cancellationToken));
    }

    [HttpDelete("{id:guid}")]
    [Authorize(Policy = "loads.delete")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        await using var transaction = await new InventoryService(dbContext).BeginWriteAsync(cancellationToken);
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
        if (transaction is not null) await transaction.CommitAsync(cancellationToken);
        return NoContent();
    }

    [HttpPost("{loadId:guid}/orders/{orderId:guid}/close")]
    [Authorize(Policy = "loads.reconcile")]
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

    [HttpPost("{id:guid}/return")]
    [Authorize(Policy = "loads.return")]
    public async Task<IActionResult> RecordReturn(Guid id, RecordLoadReturnRequest request, CancellationToken ct)
    {
        var inventory = new InventoryService(dbContext);
        await using var transaction = await inventory.BeginWriteAsync(ct);
        var load = await dbContext.DeliveryLoads.SingleOrDefaultAsync(x => x.Id == id, ct);
        if (load is null) return NotFound();
        if (load.Status is not (LoadStatus.Dispatched or LoadStatus.Closed))
            return Conflict(new { detail = "Registre a saída da carga antes de informar o retorno." });
        if (load.ReturnedAt is not null)
            return Conflict(new { detail = "O retorno desta carga já foi registrado." });
        var now = DateTimeOffset.UtcNow;
        if (request.ReturnedAt is null || request.ReturnedAt > now ||
            (load.DispatchedAt is not null && request.ReturnedAt < load.DispatchedAt))
            return BadRequest(new { detail = "Informe o retorno entre o horário de saída da carga e o momento atual." });
        load.ReturnedAt = request.ReturnedAt.Value.ToUniversalTime();
        load.ReturnRecordedAt = now;
        load.ReturnRecordedBy = User?.Identity?.Name ?? "Sistema";
        await dbContext.SaveChangesAsync(ct);
        if (transaction is not null) await transaction.CommitAsync(ct);
        return NoContent();
    }

    [HttpPost("{id:guid}/dispatch")]
    [Authorize(Policy = "loads.dispatch")]
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
    [Authorize(Policy = "loads.read")]
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
            if (!order.IsReadyForLoad)
                throw new InvalidOperationException($"Pedido {order.Number} precisa estar faturado e disponível para inclusão em carga.");
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
