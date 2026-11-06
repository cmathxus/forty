namespace DudaErp.Api.Domain;

public enum StockMovementKind { Receipt, Count, Dispatch, Return, Production }

public sealed class StockMovement : Entity
{
    public Guid ProductId { get; set; }
    public Product? Product { get; set; }
    public StockMovementKind Kind { get; set; }
    public decimal Quantity { get; set; }
    public required string Unit { get; set; }
    public required string Reason { get; set; }
    public required string RecordedBy { get; set; }
    public required string SourceKey { get; set; }
    public Guid? DeliveryLoadId { get; set; }
    public DateOnly? ProductionDate { get; set; }
}

public sealed class DeliveryItemResult : Entity
{
    public Guid DeliveryLoadOrderId { get; set; }
    public DeliveryLoadOrder? DeliveryLoadOrder { get; set; }
    public Guid OrderItemId { get; set; }
    public OrderItem? OrderItem { get; set; }
    public decimal DeliveredQuantity { get; set; }
    public decimal ReturnedQuantity { get; set; }
    public decimal MissingQuantity { get; set; }
}
