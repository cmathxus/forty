using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using DudaErp.Api.Data;
using DudaErp.Api.Domain;
using DudaErp.Api.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authentication.BearerToken;
using Microsoft.Extensions.Options;

namespace DudaErp.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/auth")]
public sealed class AuthController(AppDbContext db, PasswordHasher<AppUser> hasher, IOptionsMonitor<BearerTokenOptions> tokenOptions) : ControllerBase
{
    public sealed record LoginRequest([Required, EmailAddress] string Email, [Required] string Password);
    public sealed record PasswordRequest([Required] string CurrentPassword, [Required, MinLength(8), MaxLength(128)] string NewPassword);
    public sealed record RefreshRequest([Required, MaxLength(12000)] string RefreshToken);

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
        if (user is null || valid == PasswordVerificationResult.Failed || !AccessRules.Roles.Contains(user.Role))
            return Unauthorized(new { detail = "E-mail ou senha inválidos." });
        if (valid == PasswordVerificationResult.SuccessRehashNeeded)
        {
            user.PasswordHash = hasher.HashPassword(user, request.Password);
            await db.SaveChangesAsync(ct);
        }
        var session = new AuthSession { UserId = user.Id, ExpiresAt = DateTimeOffset.UtcNow.AddDays(30) };
        db.AuthSessions.Add(session);
        await db.SaveChangesAsync(ct);
        return IssueTokens(user, session);
    }

    private IActionResult IssueTokens(AppUser user, AuthSession session)
    {
        Response.Headers.CacheControl = "no-store";
        var identity = new ClaimsIdentity([
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Name, user.Name),
            new Claim(ClaimTypes.Email, user.Email),
            new Claim(ClaimTypes.Role, user.Role),
            new Claim("security_stamp", user.SecurityStamp.ToString()),
            new Claim("session_id", session.Id.ToString()),
            new Claim("refresh_nonce", session.RefreshNonce.ToString())
        ], "Bearer");
        return SignIn(new ClaimsPrincipal(identity), new AuthenticationProperties(), "Bearer");
    }

    private AuthenticationTicket? ReadRefresh(string value)
    {
        var ticket = tokenOptions.Get("Bearer").RefreshTokenProtector.Unprotect(value);
        return ticket?.Properties.ExpiresUtc > DateTimeOffset.UtcNow ? ticket : null;
    }

    [AllowAnonymous]
    [HttpPost("refresh")]
    public async Task<IActionResult> Refresh(RefreshRequest request, CancellationToken ct)
    {
        var ticket = ReadRefresh(request.RefreshToken);
        if (ticket is null || !Guid.TryParse(ticket.Principal.FindFirstValue("session_id"), out var sessionId) ||
            !Guid.TryParse(ticket.Principal.FindFirstValue("refresh_nonce"), out var nonce) ||
            !Guid.TryParse(ticket.Principal.FindFirstValue(ClaimTypes.NameIdentifier), out var userId) ||
            !Guid.TryParse(ticket.Principal.FindFirstValue("security_stamp"), out var stamp)) return Unauthorized();
        var user = await db.Users.AsNoTracking().SingleOrDefaultAsync(x => x.Id == userId && x.IsActive && x.SecurityStamp == stamp, ct);
        if (user is null || user.Role != ticket.Principal.FindFirstValue(ClaimTypes.Role) || !AccessRules.Roles.Contains(user.Role)) return Unauthorized();
        var session = await db.AuthSessions.AsNoTracking().SingleOrDefaultAsync(x => x.Id == sessionId && x.UserId == userId &&
            !x.Revoked && x.ExpiresAt > DateTimeOffset.UtcNow && x.RefreshNonce == nonce, ct);
        if (session is null) return Unauthorized();
        var nextNonce = Guid.NewGuid();
        if (db.Database.IsRelational())
        {
            var changed = await db.AuthSessions.Where(x => x.Id == sessionId && x.RefreshNonce == nonce && !x.Revoked)
                .ExecuteUpdateAsync(set => set.SetProperty(x => x.RefreshNonce, nextNonce), ct);
            if (changed != 1) return Unauthorized();
        }
        else
        {
            var tracked = await db.AuthSessions.SingleAsync(x => x.Id == sessionId, ct);
            if (tracked.RefreshNonce != nonce || tracked.Revoked) return Unauthorized();
            tracked.RefreshNonce = nextNonce;
            await db.SaveChangesAsync(ct);
        }
        session.RefreshNonce = nextNonce;
        return IssueTokens(user, session);
    }

    [AllowAnonymous]
    [HttpPost("logout")]
    public async Task<IActionResult> Logout(RefreshRequest request, CancellationToken ct)
    {
        var ticket = ReadRefresh(request.RefreshToken);
        if (ticket is not null && Guid.TryParse(ticket.Principal.FindFirstValue("session_id"), out var id))
        {
            var session = await db.AuthSessions.SingleOrDefaultAsync(x => x.Id == id, ct);
            if (session is not null) { session.Revoked = true; await db.SaveChangesAsync(ct); }
        }
        return NoContent();
    }

    [HttpGet("me")]
    public IActionResult Me() => Ok(new { id = User.FindFirstValue(ClaimTypes.NameIdentifier), name = User.Identity!.Name,
        email = User.FindFirstValue(ClaimTypes.Email), role = User.FindFirstValue(ClaimTypes.Role),
        permissions = User.FindAll(AccessRules.PermissionClaim).Select(x => x.Value).ToArray() });

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
