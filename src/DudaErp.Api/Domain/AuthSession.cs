namespace DudaErp.Api.Domain;

public sealed class AuthSession
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public Guid RefreshNonce { get; set; } = Guid.NewGuid();
    public DateTimeOffset ExpiresAt { get; set; }
    public bool Revoked { get; set; }
}
