namespace DudaErp.Api.Domain;

public enum PayableStatus
{
    Open,
    Paid,
    Cancelled
}

public enum ReceivableStatus
{
    Open,
    Received,
    Cancelled
}

public sealed class AccountPayable : Entity
{
    public required string Description { get; set; }
    public string? SupplierName { get; set; }
    public DateOnly DueDate { get; set; }
    public decimal Amount { get; set; }
    public PayableStatus Status { get; set; } = PayableStatus.Open;
    public DateOnly? PaidDate { get; set; }
    public Guid? CreatedById { get; set; }
    public string? CreatedBy { get; set; }
    public string? PaidBy { get; set; }
    public DateTimeOffset? CheckedAt { get; set; }
    public string? CheckedBy { get; set; }
    public string? Notes { get; set; }
}

public sealed class AccountReceivable : Entity
{
    public required string Description { get; set; }
    public Guid? CustomerId { get; set; }
    public Customer? Customer { get; set; }
    public long? OrderNumber { get; set; }
    public Guid? BilledOrderId { get; set; }
    public DateOnly DueDate { get; set; }
    public decimal Amount { get; set; }
    public ReceivableStatus Status { get; set; } = ReceivableStatus.Open;
    public DateOnly? ReceivedDate { get; set; }
    public string? Notes { get; set; }
}
