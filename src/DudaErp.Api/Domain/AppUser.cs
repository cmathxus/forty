namespace DudaErp.Api.Domain;

public sealed class AppUser : Entity
{
    public required string Email { get; set; }
    public required string Name { get; set; }
    [System.Text.Json.Serialization.JsonIgnore]
    public required string PasswordHash { get; set; }
    public string Role { get; set; } = "Faturamento";
    public string[]? CustomPermissions { get; set; }
    public bool IsActive { get; set; } = true;
    [System.Text.Json.Serialization.JsonIgnore]
    public Guid SecurityStamp { get; set; } = Guid.NewGuid();
}
