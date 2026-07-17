namespace DudaErp.Api.Domain;

public sealed class Seller : Entity
{
    public required string Code { get; set; }
    public required string Name { get; set; }
    public decimal? DefaultCommissionPercentage { get; set; }
    public bool IsActive { get; set; } = true;
}
