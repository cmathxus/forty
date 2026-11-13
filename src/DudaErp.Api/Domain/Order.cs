namespace DudaErp.Api.Domain;

public enum OrderStatus
{
    Draft,
    Confirmed,
    Scheduled,
    Delivered,
    PartiallyDelivered,
    Returned,
    Cancelled
}

public sealed class Order : Entity
{
    public long Number { get; set; }
    public Guid CustomerId { get; set; }
    public Customer? Customer { get; set; }
    public Guid SellerId { get; set; }
    public Seller? Seller { get; set; }
    public OrderStatus Status { get; set; } = OrderStatus.Confirmed;
    public bool RequiresCommercialWorkflow { get; set; }
    public DateTimeOffset? ApprovedAt { get; set; }
    public Guid? ApprovedById { get; set; }
    public string? ApprovedBy { get; set; }
    public DateTimeOffset? BilledAt { get; set; }
    public bool IsReadyForLoad => Status == OrderStatus.Confirmed && (!RequiresCommercialWorkflow || BilledAt is not null);
    public bool IsFiscalInvoiceRequested { get; set; }
    public DateOnly? DueDate { get; set; }
    public string? PaymentCondition { get; set; }
    public string? Notes { get; set; }
    public decimal TotalAmount { get; set; }
    public decimal TotalWeightInKg { get; set; }
    public List<OrderItem> Items { get; set; } = [];
}

public sealed class OrderItem : Entity
{
    public Guid OrderId { get; set; }
    public Order? Order { get; set; }
    public Guid ProductId { get; set; }
    public Product? Product { get; set; }
    public required string ProductCode { get; set; }
    public required string ProductName { get; set; }
    public required string Unit { get; set; }
    public decimal Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal UnitWeightInKg { get; set; }
    public decimal TotalAmount { get; set; }
}
