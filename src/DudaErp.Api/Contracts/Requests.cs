using System.ComponentModel.DataAnnotations;

namespace DudaErp.Api.Contracts;

public sealed record CreateRegionRequest([Required, MaxLength(100)] string Name);

public sealed record CreateSellerRequest(
    [Required, MaxLength(30)] string Code,
    [Required, MaxLength(150)] string Name,
    [Range(0, 100)] decimal? DefaultCommissionPercentage,
    [EmailAddress, MaxLength(200)] string? Email = null,
    [MaxLength(40)] string? Phone = null);

public sealed record CreateProductRequest(
    [Required, MaxLength(50)] string Code,
    [Required, MaxLength(200)] string Name,
    [Required, MaxLength(10)] string Unit,
    [Range(0.01, double.MaxValue)] decimal SalePrice,
    [Range(0, double.MaxValue)] decimal? UnitSalePrice,
    [Range(0, double.MaxValue)] decimal WeightInKg,
    string? UnitBarcode,
    string? BoxBarcode,
    string? Ncm,
    string? Cfop,
    string? Cest,
    string? BlockKType,
    string? Origin,
    string? IcmsCst,
    [Range(0, 100)] decimal? IcmsRate,
    string? IpiCst,
    [Range(0, 100)] decimal? IpiRate);

public sealed record CreateCustomerRequest(
    [Required] string LegalName,
    string? TradeName,
    [Required] string TaxId,
    string? StateRegistration,
    string? Phone,
    string? Email,
    [Required] string Street,
    [Required] string Number,
    string? Complement,
    [Required] string District,
    [Required] string City,
    [Required, StringLength(2, MinimumLength = 2)] string State,
    [Required] string PostalCode,
    Guid RegionId,
    Guid SellerId);

public sealed record CreateOrderItemRequest(
    [Required] string ProductCode,
    [Range(0.001, double.MaxValue)] decimal Quantity,
    [Range(0.01, double.MaxValue)] decimal? UnitPrice = null,
    [Range(0.01, double.MaxValue)] decimal? TotalAmount = null);

public sealed record CreateOrderRequest(
    Guid CustomerId,
    Guid? SellerId,
    bool IsFiscalInvoiceRequested,
    DateOnly? DueDate,
    string? Notes,
    [MinLength(1)] IReadOnlyCollection<CreateOrderItemRequest> Items,
    [MaxLength(40)] string? PaymentCondition = null);

public sealed record CreateVehicleRequest(
    [Required, MaxLength(100)] string Name,
    [Required, MaxLength(20)] string Plate,
    [MaxLength(100)] string? Model);

public sealed record CreateDeliveryLoadRequest(
    DateOnly ScheduledDate,
    Guid RegionId,
    Guid? VehicleId,
    string? DriverName,
    string? Notes,
    IReadOnlyCollection<Guid>? OrderIds);

public sealed record AddOrdersToLoadRequest([MinLength(1)] IReadOnlyCollection<Guid> OrderIds);

public sealed record UpdateDeliveryLoadRequest(
    DateOnly ScheduledDate,
    Guid RegionId,
    Guid? VehicleId,
    string? DriverName,
    string? Notes,
    IReadOnlyCollection<Guid>? OrderIds);

public sealed record CloseDeliveryRequest(
    DudaErp.Api.Domain.DeliveryStatus DeliveryStatus,
    DudaErp.Api.Domain.PaymentMethod PaymentMethod,
    [Range(0, double.MaxValue)] decimal? AmountReceived,
    string? DeliveryNotes);

public sealed record CreateAccountPayableRequest(
    [Required] string Description,
    string? SupplierName,
    DateOnly DueDate,
    [Range(0.01, double.MaxValue)] decimal Amount,
    string? Notes);

public sealed record CreateAccountReceivableRequest(
    [Required] string Description,
    Guid? CustomerId,
    long? OrderNumber,
    DateOnly DueDate,
    [Range(0.01, double.MaxValue)] decimal Amount,
    string? Notes);

public sealed record SettleAccountRequest(DateOnly? Date);
