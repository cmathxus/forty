namespace DudaErp.Api.Domain;

public sealed class AppUser : Entity
{
    public required string Email { get; set; }
    public required string Name { get; set; }
    public required string PasswordHash { get; set; }
    public string Role { get; set; } = "Administrador";
    public bool IsActive { get; set; } = true;
    public Guid SecurityStamp { get; set; } = Guid.NewGuid();
}
