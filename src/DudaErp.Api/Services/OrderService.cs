using DudaErp.Api.Contracts;
using DudaErp.Api.Data;
using DudaErp.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace DudaErp.Api.Services;

public sealed class OrderService(AppDbContext dbContext)
{
    public async Task<Order> CreateAsync(CreateOrderRequest request, CancellationToken cancellationToken)
    {
        ValidateItems(request);
        await using var numberingTransaction = dbContext.Database.IsNpgsql() && dbContext.Database.CurrentTransaction is null
            ? await dbContext.Database.BeginTransactionAsync(cancellationToken) : null;
        if (dbContext.Database.IsNpgsql())
            await dbContext.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(40670, 1)", cancellationToken);
        var customer = await dbContext.Customers
            .AsNoTracking()
            .SingleOrDefaultAsync(x => x.Id == request.CustomerId && x.IsActive, cancellationToken)
            ?? throw new InvalidOperationException("Cliente não encontrado ou inativo.");

        var sellerId = request.SellerId ?? customer.SellerId;
        var sellerExists = await dbContext.Sellers
            .AnyAsync(x => x.Id == sellerId && x.IsActive, cancellationToken);

        if (!sellerExists)
        {
            throw new InvalidOperationException("Vendedor não encontrado ou inativo.");
        }

        var requestedCodes = request.Items.Select(x => x.ProductCode.Trim()).Distinct().ToArray();
        var products = await dbContext.Products
            .Where(x => requestedCodes.Contains(x.Code) && x.IsActive)
            .ToDictionaryAsync(x => x.Code, cancellationToken);

        var missingCodes = requestedCodes.Where(code => !products.ContainsKey(code)).ToArray();
        if (missingCodes.Length > 0)
        {
            throw new InvalidOperationException($"Produtos não encontrados ou inativos: {string.Join(", ", missingCodes)}.");
        }

        var order = new Order
        {
            Number = await NextNumberAsync(cancellationToken),
            RequiresCommercialWorkflow = true,
            Status = OrderStatus.Draft,
            CustomerId = customer.Id,
            SellerId = sellerId,
            IsFiscalInvoiceRequested = request.IsFiscalInvoiceRequested,
            DueDate = request.DueDate,
            PaymentCondition = request.PaymentCondition?.Trim(),
            Notes = request.Notes?.Trim()
        };

        foreach (var requestedItem in request.Items)
        {
            var product = products[requestedItem.ProductCode.Trim()];
            var (unitPrice, totalAmount) = ResolvePricing(product, requestedItem);
            var item = new OrderItem
            {
                OrderId = order.Id,
                ProductId = product.Id,
                ProductCode = product.Code,
                ProductName = product.Name,
                Unit = product.Unit,
                Quantity = requestedItem.Quantity,
                UnitPrice = unitPrice,
                UnitWeightInKg = product.WeightInKg,
                TotalAmount = totalAmount
            };

            order.Items.Add(item);
        }

        order.TotalAmount = order.Items.Sum(x => x.TotalAmount);
        order.TotalWeightInKg = order.Items.Sum(x => x.UnitWeightInKg * x.Quantity);

        dbContext.Orders.Add(order);
        await dbContext.SaveChangesAsync(cancellationToken);
        if (numberingTransaction is not null) await numberingTransaction.CommitAsync(cancellationToken);
        return order;
    }

    public async Task<Order> UpdateAsync(Guid id, CreateOrderRequest request, CancellationToken cancellationToken)
    {
        ValidateItems(request);
        await using var transaction = await new InventoryService(dbContext).BeginWriteAsync(cancellationToken);
        var order = await dbContext.Orders
            .Include(x => x.Items)
            .SingleOrDefaultAsync(x => x.Id == id, cancellationToken)
            ?? throw new InvalidOperationException("Pedido não encontrado.");

        if (order.Status is not (OrderStatus.Draft or OrderStatus.Confirmed) || order.BilledAt is not null ||
            await dbContext.ProductionPlans.AnyAsync(x => x.OrderId == id && x.Status != ProductionPlanStatus.Cancelled, cancellationToken) ||
            await dbContext.DeliveryLoadOrders.AnyAsync(x => x.OrderId == id, cancellationToken))
            throw new InvalidOperationException("O pedido só pode ser editado antes do faturamento, da produção vinculada e da inclusão em carga.");

        if (await dbContext.AccountsReceivable.AnyAsync(x => x.OrderNumber == order.Number, cancellationToken))
            throw new InvalidOperationException("Este pedido possui lançamento financeiro. Revise o financeiro antes de editar.");

        var customer = await dbContext.Customers
            .AsNoTracking()
            .SingleOrDefaultAsync(x => x.Id == request.CustomerId && x.IsActive, cancellationToken)
            ?? throw new InvalidOperationException("Cliente não encontrado ou inativo.");

        var sellerId = request.SellerId ?? customer.SellerId;
        var sellerExists = await dbContext.Sellers
            .AnyAsync(x => x.Id == sellerId && x.IsActive, cancellationToken);

        if (!sellerExists)
        {
            throw new InvalidOperationException("Vendedor não encontrado ou inativo.");
        }

        var requestedCodes = request.Items.Select(x => x.ProductCode.Trim()).Distinct().ToArray();
        var products = await dbContext.Products
            .Where(x => requestedCodes.Contains(x.Code) && x.IsActive)
            .ToDictionaryAsync(x => x.Code, cancellationToken);

        var missingCodes = requestedCodes.Where(code => !products.ContainsKey(code)).ToArray();
        if (missingCodes.Length > 0)
        {
            throw new InvalidOperationException($"Produtos não encontrados ou inativos: {string.Join(", ", missingCodes)}.");
        }

        // Um único SaveChanges mantém substituição de itens e cabeçalho na mesma transação.
        dbContext.OrderItems.RemoveRange(order.Items);
        order.Items.Clear();

        order.CustomerId = customer.Id;
        order.SellerId = sellerId;
        order.IsFiscalInvoiceRequested = request.IsFiscalInvoiceRequested;
        order.DueDate = request.DueDate;
        order.PaymentCondition = request.PaymentCondition?.Trim();
        order.Notes = request.Notes?.Trim();
        order.Status = order.RequiresCommercialWorkflow ? OrderStatus.Draft : OrderStatus.Confirmed;
        order.ApprovedAt = null;
        order.ApprovedById = null;
        order.ApprovedBy = null;
        order.UpdatedAt = DateTimeOffset.UtcNow;

        var newItems = new List<OrderItem>();
        foreach (var requestedItem in request.Items)
        {
            var product = products[requestedItem.ProductCode.Trim()];
            var (unitPrice, totalAmount) = ResolvePricing(product, requestedItem);
            newItems.Add(new OrderItem
            {
                OrderId = order.Id,
                ProductId = product.Id,
                ProductCode = product.Code,
                ProductName = product.Name,
                Unit = product.Unit,
                Quantity = requestedItem.Quantity,
                UnitPrice = unitPrice,
                UnitWeightInKg = product.WeightInKg,
                TotalAmount = totalAmount
            });
        }

        order.TotalAmount = newItems.Sum(x => x.TotalAmount);
        order.TotalWeightInKg = newItems.Sum(x => x.UnitWeightInKg * x.Quantity);
        dbContext.OrderItems.AddRange(newItems);

        await dbContext.SaveChangesAsync(cancellationToken);
        if (transaction is not null) await transaction.CommitAsync(cancellationToken);
        return order;
    }

    private async Task<long> NextNumberAsync(CancellationToken cancellationToken)
    {
        var lastNumber = await dbContext.Orders.MaxAsync(x => (long?)x.Number, cancellationToken);
        return (lastNumber ?? -1) + 1;
    }

    private static (decimal UnitPrice, decimal TotalAmount) ResolvePricing(Product product, CreateOrderItemRequest item)
    {
        if (item.Quantity <= 0 || decimal.Round(item.Quantity, 3) != item.Quantity)
            throw new InvalidOperationException("Informe uma quantidade positiva com até três casas decimais.");
        if (item.UnitPrice is <= 0 || item.TotalAmount is <= 0)
            throw new InvalidOperationException("Preço e total do item devem ser positivos.");
        var totalAmount = item.TotalAmount is > 0
            ? decimal.Round(item.TotalAmount.Value, 2)
            : (decimal?)null;

        var unitPrice = item.UnitPrice is > 0
            ? decimal.Round(item.UnitPrice.Value, 2)
            : totalAmount is > 0 && item.Quantity > 0
                ? decimal.Round(totalAmount.Value / item.Quantity, 2)
                : decimal.Round(product.SalePrice, 2);

        totalAmount ??= decimal.Round(unitPrice * item.Quantity, 2);
        if (totalAmount <= 0 || unitPrice <= 0)
            throw new InvalidOperationException("Preço e total do item devem ser maiores que zero após arredondamento.");
        if (item.UnitPrice.HasValue && item.TotalAmount.HasValue &&
            decimal.Abs(totalAmount.Value - decimal.Round(unitPrice * item.Quantity, 2)) > 0.01m &&
            decimal.Round(totalAmount.Value / item.Quantity, 2) != unitPrice)
            throw new InvalidOperationException("O preço, a quantidade e o total do item estão inconsistentes. Revise os valores.");
        return (unitPrice, totalAmount.Value);
    }

    private static void ValidateItems(CreateOrderRequest request)
    {
        if (request.Items is null || request.Items.Count == 0 || request.Items.Any(x => string.IsNullOrWhiteSpace(x.ProductCode)))
            throw new InvalidOperationException("Informe pelo menos um item com código de produto válido.");
    }
}
