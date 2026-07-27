using DudaErp.Api.Contracts;
using DudaErp.Api.Data;
using DudaErp.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace DudaErp.Api.Services;

public sealed class OrderService(AppDbContext dbContext)
{
    public async Task<Order> CreateAsync(CreateOrderRequest request, CancellationToken cancellationToken)
    {
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
        return order;
    }

    public async Task<Order> UpdateAsync(Guid id, CreateOrderRequest request, CancellationToken cancellationToken)
    {
        var order = await dbContext.Orders
            .SingleOrDefaultAsync(x => x.Id == id, cancellationToken)
            ?? throw new InvalidOperationException("Pedido não encontrado.");

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

        await dbContext.DeliveryLoadOrders
            .Where(x => x.OrderId == id)
            .ExecuteDeleteAsync(cancellationToken);

        await dbContext.OrderItems
            .Where(x => x.OrderId == id)
            .ExecuteDeleteAsync(cancellationToken);

        order.CustomerId = customer.Id;
        order.SellerId = sellerId;
        order.IsFiscalInvoiceRequested = request.IsFiscalInvoiceRequested;
        order.DueDate = request.DueDate;
        order.PaymentCondition = request.PaymentCondition?.Trim();
        order.Notes = request.Notes?.Trim();
        order.Status = OrderStatus.Confirmed;
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
        return order;
    }

    private async Task<long> NextNumberAsync(CancellationToken cancellationToken)
    {
        var lastNumber = await dbContext.Orders.MaxAsync(x => (long?)x.Number, cancellationToken);
        return (lastNumber ?? -1) + 1;
    }

    private static (decimal UnitPrice, decimal TotalAmount) ResolvePricing(Product product, CreateOrderItemRequest item)
    {
        var totalAmount = item.TotalAmount is > 0
            ? decimal.Round(item.TotalAmount.Value, 2)
            : (decimal?)null;

        var unitPrice = item.UnitPrice is > 0
            ? decimal.Round(item.UnitPrice.Value, 2)
            : totalAmount is > 0 && item.Quantity > 0
                ? decimal.Round(totalAmount.Value / item.Quantity, 2)
                : decimal.Round(product.SalePrice, 2);

        totalAmount ??= decimal.Round(unitPrice * item.Quantity, 2);
        return (unitPrice, totalAmount.Value);
    }
}
