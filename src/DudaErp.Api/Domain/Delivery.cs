namespace DudaErp.Api.Domain;

public enum LoadStatus
{
    Open,
    Dispatched,
    Closed,
    Cancelled
}

public enum DeliveryStatus
{
    Pending,
    Delivered,
    PartiallyDelivered,
    Refused,
    Returned
}

public enum PaymentMethod
{
    None,
    Cash,
    Pix,
    Boleto,
    Check,
    Card,
    Transfer,
    Other
}

public sealed class Vehicle : Entity
{
    public required string Name { get; set; }
    public required string Plate { get; set; }
    public string? Model { get; set; }
    public bool IsActive { get; set; } = true;
}

public sealed class DeliveryLoad : Entity
{
    public long Number { get; set; }
    public DateOnly ScheduledDate { get; set; }
    public Guid RegionId { get; set; }
    public Region? Region { get; set; }
    public Guid? VehicleId { get; set; }
    public Vehicle? Vehicle { get; set; }
    public string? DriverName { get; set; }
    public LoadStatus Status { get; set; } = LoadStatus.Open;
    public bool InventoryTracked { get; set; }
    public string? Notes { get; set; }
    public List<DeliveryLoadOrder> Orders { get; set; } = [];
}

public sealed class DeliveryLoadOrder : Entity
{
    public Guid DeliveryLoadId { get; set; }
    public DeliveryLoad? DeliveryLoad { get; set; }
    public Guid OrderId { get; set; }
    public Order? Order { get; set; }
    public DeliveryStatus DeliveryStatus { get; set; } = DeliveryStatus.Pending;
    public PaymentMethod PaymentMethod { get; set; } = PaymentMethod.None;
    public decimal? AmountReceived { get; set; }
    public DateTimeOffset? DeliveredAt { get; set; }
    public string? DeliveryNotes { get; set; }
    public List<DeliveryItemResult> ItemResults { get; set; } = [];
}
