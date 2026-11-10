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
    [HttpGet("customers"), Authorize(Policy = "customers.manage")]
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

    [HttpGet("products"), Authorize(Policy = "catalog.read")]
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

    [HttpGet("sellers"), Authorize(Policy = "catalog.manage")]
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

    [HttpGet("regions"), Authorize(Policy = "catalog.manage")]
    public async Task<IActionResult> Regions([FromQuery] PageQuery request, CancellationToken ct)
    {
        var query = db.Regions.AsNoTracking().Where(x => x.IsActive);
        if (request.HasSearch) query = query.Where(x => EF.Functions.ILike(x.Name, request.Pattern, "\\"));
        return Ok(await query.OrderBy(x => x.Name).ThenBy(x => x.Id).ReadPageAsync(request, ct));
    }

    [HttpGet("vehicles"), Authorize(Policy = "catalog.manage")]
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
            .Select(x => new UsersController.UserView(x.Id, x.Name, x.Email, x.Role, x.IsActive, x.CreatedAt))
            .ReadPageAsync(request, ct));
    }
}
