namespace DudaErp.Api.Domain;

public sealed class Product : Entity
{
    public required string Code { get; set; }
    public required string Name { get; set; }
    public required string Unit { get; set; }
    public decimal SalePrice { get; set; }
    public decimal? UnitSalePrice { get; set; }
    public decimal WeightInKg { get; set; }
    public string? UnitBarcode { get; set; }
    public string? BoxBarcode { get; set; }
    public string? Ncm { get; set; }
    public string? Cfop { get; set; }
    public string? Cest { get; set; }
    public string? BlockKType { get; set; }
    public string? Origin { get; set; }
    public string? IcmsCst { get; set; }
    public decimal? IcmsRate { get; set; }
    public string? IpiCst { get; set; }
    public decimal? IpiRate { get; set; }
    public bool IsActive { get; set; } = true;
}
