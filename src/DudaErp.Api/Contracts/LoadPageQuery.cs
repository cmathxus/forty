using System.ComponentModel.DataAnnotations;

namespace DudaErp.Api.Contracts;

public sealed class LoadPageQuery : IValidatableObject
{
    [Range(1, 1000000)] public int Page { get; set; } = 1;
    [Range(20, 20)] public int PageSize { get; set; } = 20;
    [StringLength(200)] public string? Search { get; set; }
    [Range(0, 3)] public int? Stage { get; set; }
    public Guid? RegionId { get; set; }
    public Guid? VehicleId { get; set; }
    [StringLength(150)] public string? Driver { get; set; }
    public DateOnly? From { get; set; }
    public DateOnly? To { get; set; }
    public bool Shortages { get; set; }
    public IEnumerable<ValidationResult> Validate(ValidationContext context)
    {
        if (From > To) yield return new("A data inicial deve ser anterior ou igual à data final.", [nameof(From), nameof(To)]);
    }
}
