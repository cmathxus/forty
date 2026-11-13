using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using DudaErp.Api.Data;
using DudaErp.Api.Domain;
using DudaErp.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace DudaErp.Api.Controllers;

[ApiController]
[Route("api/users")]
[Authorize(Policy = "users.manage")]
public sealed class UsersController(AppDbContext db, PasswordHasher<AppUser> hasher) : ControllerBase
{
    public sealed record CreateUserRequest([Required, MaxLength(150)] string Name,
        [Required, EmailAddress, MaxLength(254)] string Email, [Required] string Role,
        [Required, MinLength(8), MaxLength(128)] string Password, string[]? CustomPermissions = null);
    public sealed record UpdateUserRequest([Required, MaxLength(150)] string Name,
        [Required, EmailAddress, MaxLength(254)] string Email, [Required] string Role, bool IsActive, string[]? CustomPermissions = null);
    public sealed record ResetPasswordRequest([Required, MinLength(8), MaxLength(128)] string Password);
    public sealed record UserView(Guid Id, string Name, string Email, string Role, bool IsActive, DateTimeOffset CreatedAt, string[]? CustomPermissions);
    private static UserView View(AppUser user) => new(user.Id, user.Name, user.Email, user.Role, user.IsActive, user.CreatedAt, user.CustomPermissions);

    [HttpGet("permissions")]
    public IActionResult GetPermissions() => Ok(new
    {
        modules = AccessRules.Modules.Select(module => new
        {
            module.Group, module.Name, actions = module.Actions.Select(action => new { action.Key, action.Label })
        }),
        templates = AccessRules.Roles.ToDictionary(role => role, role => AccessRules.ForRole(role).Where(AccessRules.IsCustomPermission))
    });

    [HttpGet]
    public Task<List<UserView>> Get(CancellationToken ct) => db.Users.AsNoTracking().OrderBy(x => x.Name)
        .Select(x => new UserView(x.Id, x.Name, x.Email, x.Role, x.IsActive, x.CreatedAt, x.CustomPermissions)).ToListAsync(ct);

    [HttpPost]
    public async Task<IActionResult> Create(CreateUserRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Name) || !AccessRules.Roles.Contains(request.Role))
            return BadRequest(new { detail = "Informe um nome e selecione um dos perfis disponíveis." });
        if (!ValidPermissions(request.Role, request.CustomPermissions)) return InvalidPermissions();
        await using var transaction = await BeginWrite(ct);
        var email = request.Email.Trim().ToLowerInvariant();
        if (await db.Users.AnyAsync(x => x.Email == email, ct)) return Conflict(new { detail = "Já existe um usuário com esse e-mail, inclusive entre os inativos." });
        var user = new AppUser { Name = request.Name.Trim(), Email = email, Role = request.Role, PasswordHash = "",
            CustomPermissions = request.CustomPermissions?.Distinct(StringComparer.Ordinal).ToArray() };
        user.PasswordHash = hasher.HashPassword(user, request.Password);
        db.Users.Add(user); await db.SaveChangesAsync(ct);
        if (transaction is not null) await transaction.CommitAsync(ct);
        return Ok(View(user));
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, UpdateUserRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Name) || !AccessRules.Roles.Contains(request.Role))
            return BadRequest(new { detail = "Informe um nome e um perfil válido." });
        if (!ValidPermissions(request.Role, request.CustomPermissions)) return InvalidPermissions();
        await using var transaction = await BeginWrite(ct);
        var user = await db.Users.SingleOrDefaultAsync(x => x.Id == id, ct);
        if (user is null) return NotFound();
        if (User.FindFirstValue(ClaimTypes.NameIdentifier) == id.ToString() && (!request.IsActive || request.Role != AccessRules.Admin))
            return Conflict(new { detail = "Você não pode desativar a própria conta nem remover seu próprio acesso de administrador." });
        if (user.IsActive && user.Role == AccessRules.Admin && (!request.IsActive || request.Role != AccessRules.Admin) &&
            !await db.Users.AnyAsync(x => x.Id != id && x.IsActive && x.Role == AccessRules.Admin, ct))
            return Conflict(new { detail = "É necessário manter pelo menos um administrador ativo." });
        var email = request.Email.Trim().ToLowerInvariant();
        if (await db.Users.AnyAsync(x => x.Id != id && x.Email == email, ct)) return Conflict(new { detail = "Já existe um usuário com esse e-mail." });
        user.Name = request.Name.Trim(); user.Email = email; user.Role = request.Role; user.IsActive = request.IsActive;
        user.CustomPermissions = request.CustomPermissions?.Distinct(StringComparer.Ordinal).ToArray();
        user.SecurityStamp = Guid.NewGuid(); user.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        if (transaction is not null) await transaction.CommitAsync(ct);
        return Ok(View(user));
    }

    [HttpPost("{id:guid}/password")]
    public async Task<IActionResult> ResetPassword(Guid id, ResetPasswordRequest request, CancellationToken ct)
    {
        if (User.FindFirstValue(ClaimTypes.NameIdentifier) == id.ToString())
            return Conflict(new { detail = "Para trocar sua própria senha, use Alterar senha no perfil." });
        await using var transaction = await BeginWrite(ct);
        var user = await db.Users.SingleOrDefaultAsync(x => x.Id == id, ct);
        if (user is null) return NotFound();
        user.PasswordHash = hasher.HashPassword(user, request.Password);
        user.SecurityStamp = Guid.NewGuid(); user.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        if (transaction is not null) await transaction.CommitAsync(ct);
        return NoContent();
    }

    private static bool ValidPermissions(string role, string[]? permissions) =>
        permissions is null || (role != AccessRules.Admin && permissions.Length <= AccessRules.Permissions.Count &&
            permissions.All(AccessRules.IsCustomPermission) && AccessRules.ValidCombination(permissions));

    private BadRequestObjectResult InvalidPermissions() =>
        BadRequest(new { detail = "Selecione permissões válidas e habilite a consulta para operar no módulo. O perfil Administrador tem acesso completo." });

    private async Task<Microsoft.EntityFrameworkCore.Storage.IDbContextTransaction?> BeginWrite(CancellationToken ct)
    {
        if (!db.Database.IsNpgsql()) return null;
        var transaction = db.Database.CurrentTransaction is null ? await db.Database.BeginTransactionAsync(ct) : null;
        try { await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(40670, 4)", ct); }
        catch { if (transaction is not null) await transaction.DisposeAsync(); throw; }
        return transaction;
    }
}
