namespace DudaErp.Api.Domain;

public sealed class Region : Entity
{
    public required string Name { get; set; }
    public bool IsActive { get; set; } = true;
}
