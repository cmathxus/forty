using DudaErp.Api.Contracts;
using DudaErp.Api.Data;
using DudaErp.Api.Domain;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace DudaErp.Api.Controllers;

[ApiController]
[Route("api/catalog")]
public sealed class CatalogController(AppDbContext dbContext) : ControllerBase
{
    [HttpPost("regions")]
    public async Task<ActionResult<Region>> CreateRegion(CreateRegionRequest request, CancellationToken cancellationToken)
    {
        var region = new Region { Name = request.Name.Trim() };
        dbContext.Regions.Add(region);
        await dbContext.SaveChangesAsync(cancellationToken);
        return CreatedAtAction(nameof(GetRegions), new { id = region.Id }, region);
    }

    [HttpGet("regions")]
    public Task<List<Region>> GetRegions(CancellationToken cancellationToken) =>
        dbContext.Regions.AsNoTracking().OrderBy(x => x.Name).ToListAsync(cancellationToken);

    [HttpPut("regions/{id:guid}")]
    public async Task<ActionResult<Region>> UpdateRegion(Guid id, CreateRegionRequest request, CancellationToken cancellationToken)
    {
        var region = await dbContext.Regions.SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (region is null) return NotFound();

        region.Name = request.Name.Trim();
        region.IsActive = true;
        region.UpdatedAt = DateTimeOffset.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
        return Ok(region);
    }

    [HttpDelete("regions/{id:guid}")]
    public async Task<IActionResult> DeleteRegion(Guid id, CancellationToken cancellationToken)
    {
        var region = await dbContext.Regions.SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (region is null) return NotFound();

        region.IsActive = false;
        region.UpdatedAt = DateTimeOffset.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [HttpPost("sellers")]
    public async Task<ActionResult<Seller>> CreateSeller(CreateSellerRequest request, CancellationToken cancellationToken)
    {
        var seller = new Seller
        {
            Code = request.Code.Trim(),
            Name = request.Name.Trim(),
            DefaultCommissionPercentage = request.DefaultCommissionPercentage
        };
        dbContext.Sellers.Add(seller);
        await dbContext.SaveChangesAsync(cancellationToken);
        return Created($"/api/catalog/sellers/{seller.Id}", seller);
    }

    [HttpGet("sellers")]
    public Task<List<Seller>> GetSellers(CancellationToken cancellationToken) =>
        dbContext.Sellers.AsNoTracking().OrderBy(x => x.Name).ToListAsync(cancellationToken);

    [HttpPut("sellers/{id:guid}")]
    public async Task<ActionResult<Seller>> UpdateSeller(Guid id, CreateSellerRequest request, CancellationToken cancellationToken)
    {
        var seller = await dbContext.Sellers.SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (seller is null) return NotFound();

        seller.Code = request.Code.Trim();
        seller.Name = request.Name.Trim();
        seller.DefaultCommissionPercentage = request.DefaultCommissionPercentage;
        seller.IsActive = true;
        seller.UpdatedAt = DateTimeOffset.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
        return Ok(seller);
    }

    [HttpDelete("sellers/{id:guid}")]
    public async Task<IActionResult> DeleteSeller(Guid id, CancellationToken cancellationToken)
    {
        var seller = await dbContext.Sellers.SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (seller is null) return NotFound();

        seller.IsActive = false;
        seller.UpdatedAt = DateTimeOffset.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [HttpPost("products")]
    public async Task<ActionResult<Product>> CreateProduct(CreateProductRequest request, CancellationToken cancellationToken)
    {
        var product = new Product
        {
            Code = request.Code.Trim(),
            Name = request.Name.Trim(),
            Unit = request.Unit.Trim().ToUpperInvariant(),
            SalePrice = request.SalePrice,
            UnitSalePrice = request.UnitSalePrice,
            WeightInKg = request.WeightInKg,
            UnitBarcode = request.UnitBarcode?.Trim(),
            BoxBarcode = request.BoxBarcode?.Trim(),
            Ncm = request.Ncm?.Trim(),
            Cfop = request.Cfop?.Trim(),
            Cest = request.Cest?.Trim(),
            BlockKType = request.BlockKType?.Trim(),
            Origin = request.Origin?.Trim(),
            IcmsCst = request.IcmsCst?.Trim(),
            IcmsRate = request.IcmsRate,
            IpiCst = request.IpiCst?.Trim(),
            IpiRate = request.IpiRate
        };
        dbContext.Products.Add(product);
        await dbContext.SaveChangesAsync(cancellationToken);
        return Created($"/api/catalog/products/{product.Id}", product);
    }

    [HttpGet("products/{code}")]
    public async Task<ActionResult<Product>> GetProductByCode(string code, CancellationToken cancellationToken)
    {
        var product = await dbContext.Products.AsNoTracking()
            .SingleOrDefaultAsync(x => x.Code == code && x.IsActive, cancellationToken);
        return product is null ? NotFound() : Ok(product);
    }

    [HttpGet("products")]
    public Task<List<Product>> GetProducts(CancellationToken cancellationToken) =>
        dbContext.Products.AsNoTracking().OrderBy(x => x.Code).ToListAsync(cancellationToken);

    [HttpPut("products/{id:guid}")]
    public async Task<ActionResult<Product>> UpdateProduct(Guid id, CreateProductRequest request, CancellationToken cancellationToken)
    {
        var product = await dbContext.Products.SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (product is null) return NotFound();

        product.Code = request.Code.Trim();
        product.Name = request.Name.Trim();
        product.Unit = request.Unit.Trim().ToUpperInvariant();
        product.SalePrice = request.SalePrice;
        product.UnitSalePrice = request.UnitSalePrice;
        product.WeightInKg = request.WeightInKg;
        product.UnitBarcode = request.UnitBarcode?.Trim();
        product.BoxBarcode = request.BoxBarcode?.Trim();
        product.Ncm = request.Ncm?.Trim();
        product.Cfop = request.Cfop?.Trim();
        product.Cest = request.Cest?.Trim();
        product.BlockKType = request.BlockKType?.Trim();
        product.Origin = request.Origin?.Trim();
        product.IcmsCst = request.IcmsCst?.Trim();
        product.IcmsRate = request.IcmsRate;
        product.IpiCst = request.IpiCst?.Trim();
        product.IpiRate = request.IpiRate;
        product.IsActive = true;
        product.UpdatedAt = DateTimeOffset.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
        return Ok(product);
    }

    [HttpDelete("products/{id:guid}")]
    public async Task<IActionResult> DeleteProduct(Guid id, CancellationToken cancellationToken)
    {
        var product = await dbContext.Products.SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (product is null) return NotFound();

        product.IsActive = false;
        product.UpdatedAt = DateTimeOffset.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [HttpPost("vehicles")]
    public async Task<ActionResult<Vehicle>> CreateVehicle(CreateVehicleRequest request, CancellationToken cancellationToken)
    {
        var vehicle = new Vehicle
        {
            Name = request.Name.Trim(),
            Plate = request.Plate.Trim().ToUpperInvariant(),
            Model = request.Model?.Trim()
        };
        dbContext.Vehicles.Add(vehicle);
        await dbContext.SaveChangesAsync(cancellationToken);
        return Created($"/api/catalog/vehicles/{vehicle.Id}", vehicle);
    }

    [HttpGet("vehicles")]
    public Task<List<Vehicle>> GetVehicles(CancellationToken cancellationToken) =>
        dbContext.Vehicles.AsNoTracking().OrderBy(x => x.Name).ToListAsync(cancellationToken);

    [HttpPut("vehicles/{id:guid}")]
    public async Task<ActionResult<Vehicle>> UpdateVehicle(Guid id, CreateVehicleRequest request, CancellationToken cancellationToken)
    {
        var vehicle = await dbContext.Vehicles.SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (vehicle is null) return NotFound();

        vehicle.Name = request.Name.Trim();
        vehicle.Plate = request.Plate.Trim().ToUpperInvariant();
        vehicle.Model = request.Model?.Trim();
        vehicle.IsActive = true;
        vehicle.UpdatedAt = DateTimeOffset.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
        return Ok(vehicle);
    }

    [HttpDelete("vehicles/{id:guid}")]
    public async Task<IActionResult> DeleteVehicle(Guid id, CancellationToken cancellationToken)
    {
        var vehicle = await dbContext.Vehicles.SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (vehicle is null) return NotFound();

        vehicle.IsActive = false;
        vehicle.UpdatedAt = DateTimeOffset.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
        return NoContent();
    }
}
