using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using DudaErp.Api.Data;
using DudaErp.Api.Domain;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace DudaErp.Api.Controllers;

[ApiController]
[Route("api/auth")]
public sealed class AuthController(AppDbContext db, PasswordHasher<AppUser> hasher) : ControllerBase
{
    public sealed record LoginRequest([Required, EmailAddress] string Email, [Required] string Password);
    public sealed record PasswordRequest([Required] string CurrentPassword, [Required, MinLength(8), MaxLength(128)] string NewPassword);

    [AllowAnonymous]
    [EnableRateLimiting("login")]
    [HttpPost("login")]
    public async Task<IActionResult> Login(LoginRequest request, CancellationToken ct)
    {
        var email = request.Email.Trim().ToLowerInvariant();
        var user = await db.Users.SingleOrDefaultAsync(x => x.Email == email && x.IsActive, ct);
        // Também calcula hash em tentativas com usuário inexistente.
        var candidate = user ?? new AppUser { Email = email, Name = "", PasswordHash = "" };
        var hash = user?.PasswordHash ?? hasher.HashPassword(candidate, "invalid-password-placeholder");
        var valid = hasher.VerifyHashedPassword(candidate, hash, request.Password);
        if (user is null || valid == PasswordVerificationResult.Failed)
            return Unauthorized(new { detail = "E-mail ou senha inválidos." });
        if (valid == PasswordVerificationResult.SuccessRehashNeeded)
        {
            user.PasswordHash = hasher.HashPassword(user, request.Password);
            await db.SaveChangesAsync(ct);
        }
        var identity = new ClaimsIdentity([
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Name, user.Name),
            new Claim(ClaimTypes.Email, user.Email),
            new Claim(ClaimTypes.Role, user.Role),
            new Claim("security_stamp", user.SecurityStamp.ToString())
        ], "Bearer");
        return SignIn(new ClaimsPrincipal(identity), new AuthenticationProperties(), "Bearer");
    }

    [HttpGet("me")]
    public IActionResult Me() => Ok(new { name = User.Identity!.Name,
        email = User.FindFirstValue(ClaimTypes.Email), role = User.FindFirstValue(ClaimTypes.Role) });

    [HttpPost("password")]
    public async Task<IActionResult> ChangePassword(PasswordRequest request, CancellationToken ct)
    {
        var id = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var user = await db.Users.SingleAsync(x => x.Id == id, ct);
        if (hasher.VerifyHashedPassword(user, user.PasswordHash, request.CurrentPassword) == PasswordVerificationResult.Failed)
            return BadRequest(new { detail = "A senha atual está incorreta." });
        user.PasswordHash = hasher.HashPassword(user, request.NewPassword);
        user.SecurityStamp = Guid.NewGuid();
        user.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return NoContent();
    }
}
