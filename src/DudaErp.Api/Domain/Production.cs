namespace DudaErp.Api.Domain;

public enum ProductionPlanStatus { Planned, Completed, Cancelled }

public sealed class ProductionPlan : Entity
{
    public long Number { get; set; }
    public Guid RequestId { get; set; }
    public Guid? OrderId { get; set; }
    public long? OrderNumber { get; set; }
    public DateOnly ScheduledDate { get; set; }
    public ProductionPlanStatus Status { get; set; }
    public string? Notes { get; set; }
    public required string CreatedBy { get; set; }
    public string? CompletedBy { get; set; }
    public DateOnly? ProductionDate { get; set; }
    public DateTimeOffset? CompletedAt { get; set; }
    public List<ProductionPlanItem> Items { get; set; } = [];
}

public sealed class ProductionPlanItem : Entity
{
    public Guid ProductionPlanId { get; set; }
    public ProductionPlan? ProductionPlan { get; set; }
    public Guid ProductId { get; set; }
    public Product? Product { get; set; }
    public required string ProductCode { get; set; }
    public required string ProductName { get; set; }
    public required string Unit { get; set; }
    public decimal PlannedQuantity { get; set; }
    public decimal? ProducedQuantity { get; set; }
}
