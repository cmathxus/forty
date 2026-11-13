using DudaErp.Api.Contracts;
using DudaErp.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace DudaErp.Api.Controllers;

[ApiController]
[Route("api/lists")]
public sealed class ListPagesController(AppDbContext db) : ControllerBase
{
    [HttpGet("orders"), Authorize(Policy = "orders.commercial")]
    public async Task<IActionResult> Orders([FromQuery] PageQuery request, CancellationToken ct, Domain.OrderStatus? status = null,
        bool? approved = null, bool? delivered = null)
    {
        if (status is not null && !Enum.IsDefined(status.Value)) return BadRequest(new { detail = "Situação inválida." });
        var query = db.Orders.AsNoTracking();
        if (status is not null) query = query.Where(x => x.Status == status);
        if (approved is bool isApproved) query = query.Where(x => (x.ApprovedAt != null) == isApproved);
        if (delivered is bool isDelivered) query = query.Where(x => (x.Status == Domain.OrderStatus.Delivered) == isDelivered);
        if (request.HasSearch) {
            var pattern = request.Pattern;
            query = query.Where(x => EF.Functions.ILike(x.Number.ToString(), pattern, "\\") || EF.Functions.ILike(x.Customer!.LegalName, pattern, "\\") || EF.Functions.ILike(x.Seller!.Name, pattern, "\\"));
        }
        return Ok(await query.Include(x => x.Customer).ThenInclude(x => x!.Region).Include(x => x.Seller).Include(x => x.Items).AsSplitQuery()
            .OrderByDescending(x => x.Number).ThenBy(x => x.Id).ReadPageAsync(request, ct));
    }
    [HttpGet("customers"), Authorize(Policy = "customers.read")]
    public async Task<IActionResult> Customers([FromQuery] PageQuery request, CancellationToken ct)
    {
        var query = db.Customers.AsNoTracking().Where(x => x.IsActive);
        if (request.HasSearch)
        {
            var pattern = request.Pattern;
            query = query.Where(x => EF.Functions.ILike(x.LegalName, pattern, "\\") ||
                EF.Functions.ILike(x.TradeName ?? "", pattern, "\\") || EF.Functions.ILike(x.TaxId, pattern, "\\") ||
                EF.Functions.ILike(x.City, pattern, "\\") || EF.Functions.ILike(x.Phone ?? "", pattern, "\\") ||
                EF.Functions.ILike(x.Email ?? "", pattern, "\\"));
        }
        return Ok(await query.Include(x => x.Region).Include(x => x.Seller)
            .OrderBy(x => x.LegalName).ThenBy(x => x.Id).ReadPageAsync(request, ct));
    }

    [HttpGet("products"), Authorize(Policy = "products.read")]
    public async Task<IActionResult> Products([FromQuery] PageQuery request, CancellationToken ct)
    {
        var query = db.Products.AsNoTracking().Where(x => x.IsActive);
        if (request.HasSearch)
        {
            var pattern = request.Pattern;
            query = query.Where(x => EF.Functions.ILike(x.Code, pattern, "\\") || EF.Functions.ILike(x.Name, pattern, "\\") ||
                EF.Functions.ILike(x.Ncm ?? "", pattern, "\\") || EF.Functions.ILike(x.Cest ?? "", pattern, "\\") ||
                EF.Functions.ILike(x.BoxBarcode ?? "", pattern, "\\"));
        }
        return Ok(await query.OrderBy(x => x.Code).ThenBy(x => x.Id).ReadPageAsync(request, ct));
    }

    [HttpGet("sellers"), Authorize(Policy = "sellers.read")]
    public async Task<IActionResult> Sellers([FromQuery] PageQuery request, CancellationToken ct)
    {
        var query = db.Sellers.AsNoTracking().Where(x => x.IsActive);
        if (request.HasSearch)
        {
            var pattern = request.Pattern;
            query = query.Where(x => EF.Functions.ILike(x.Code, pattern, "\\") || EF.Functions.ILike(x.Name, pattern, "\\") ||
                EF.Functions.ILike(x.Email ?? "", pattern, "\\") || EF.Functions.ILike(x.Phone ?? "", pattern, "\\"));
        }
        return Ok(await query.OrderBy(x => x.Name).ThenBy(x => x.Id).ReadPageAsync(request, ct));
    }

    [HttpGet("regions"), Authorize(Policy = "regions.read")]
    public async Task<IActionResult> Regions([FromQuery] PageQuery request, CancellationToken ct)
    {
        var query = db.Regions.AsNoTracking().Where(x => x.IsActive);
        if (request.HasSearch) query = query.Where(x => EF.Functions.ILike(x.Name, request.Pattern, "\\"));
        return Ok(await query.OrderBy(x => x.Name).ThenBy(x => x.Id).ReadPageAsync(request, ct));
    }

    [HttpGet("vehicles"), Authorize(Policy = "vehicles.read")]
    public async Task<IActionResult> Vehicles([FromQuery] PageQuery request, CancellationToken ct)
    {
        var query = db.Vehicles.AsNoTracking().Where(x => x.IsActive);
        if (request.HasSearch)
        {
            var pattern = request.Pattern;
            query = query.Where(x => EF.Functions.ILike(x.Name, pattern, "\\") || EF.Functions.ILike(x.Plate, pattern, "\\") ||
                EF.Functions.ILike(x.Model ?? "", pattern, "\\"));
        }
        return Ok(await query.OrderBy(x => x.Name).ThenBy(x => x.Id).ReadPageAsync(request, ct));
    }

    [HttpGet("users"), Authorize(Policy = "users.manage")]
    public async Task<IActionResult> Users([FromQuery] PageQuery request, CancellationToken ct)
    {
        var query = db.Users.AsNoTracking();
        if (request.HasSearch)
        {
            var pattern = request.Pattern;
            query = query.Where(x => EF.Functions.ILike(x.Name, pattern, "\\") || EF.Functions.ILike(x.Email, pattern, "\\") ||
                EF.Functions.ILike(x.Role, pattern, "\\"));
        }
        // Nunca serializar AppUser: contém hash de senha e carimbo de segurança.
        return Ok(await query.OrderBy(x => x.Name).ThenBy(x => x.Id)
            .Select(x => new UsersController.UserView(x.Id, x.Name, x.Email, x.Role, x.IsActive, x.CreatedAt, x.CustomPermissions))
            .ReadPageAsync(request, ct));
    }
}
