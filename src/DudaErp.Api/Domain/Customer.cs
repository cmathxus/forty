namespace DudaErp.Api.Domain;

public sealed class Customer : Entity
{
    public required string LegalName { get; set; }
    public string? TradeName { get; set; }
    public required string TaxId { get; set; }
    public string? StateRegistration { get; set; }
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public required string Street { get; set; }
    public required string Number { get; set; }
    public string? Complement { get; set; }
    public required string District { get; set; }
    public required string City { get; set; }
    public required string State { get; set; }
    public required string PostalCode { get; set; }
    public Guid RegionId { get; set; }
    public Region? Region { get; set; }
    public Guid SellerId { get; set; }
    public Seller? Seller { get; set; }
    public bool IsActive { get; set; } = true;
}
