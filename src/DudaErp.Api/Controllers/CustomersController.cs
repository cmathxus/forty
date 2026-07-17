using DudaErp.Api.Contracts;
using DudaErp.Api.Data;
using DudaErp.Api.Domain;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace DudaErp.Api.Controllers;

[ApiController]
[Route("api/customers")]
public sealed class CustomersController(AppDbContext dbContext) : ControllerBase
{
    [HttpGet]
    public Task<List<Customer>> GetAll(CancellationToken cancellationToken) =>
        dbContext.Customers.AsNoTracking()
            .Include(x => x.Region)
            .Include(x => x.Seller)
            .OrderBy(x => x.LegalName)
            .ToListAsync(cancellationToken);

    [HttpPost]
    public async Task<ActionResult<Customer>> Create(CreateCustomerRequest request, CancellationToken cancellationToken)
    {
        if (!await dbContext.Regions.AnyAsync(x => x.Id == request.RegionId && x.IsActive, cancellationToken))
            return BadRequest(new ValidationProblemDetails(
                new Dictionary<string, string[]> { ["regionId"] = ["Região inválida ou inativa."] }));

        if (!await dbContext.Sellers.AnyAsync(x => x.Id == request.SellerId && x.IsActive, cancellationToken))
            return BadRequest(new ValidationProblemDetails(
                new Dictionary<string, string[]> { ["sellerId"] = ["Vendedor inválido ou inativo."] }));

        var customer = new Customer
        {
            LegalName = request.LegalName.Trim(), TradeName = request.TradeName?.Trim(),
            TaxId = request.TaxId.Trim(), StateRegistration = request.StateRegistration?.Trim(),
            Phone = request.Phone?.Trim(), Email = request.Email?.Trim(), Street = request.Street.Trim(),
            Number = request.Number.Trim(), Complement = request.Complement?.Trim(), District = request.District.Trim(),
            City = request.City.Trim(), State = request.State.Trim().ToUpperInvariant(), PostalCode = request.PostalCode.Trim(),
            RegionId = request.RegionId, SellerId = request.SellerId
        };

        dbContext.Customers.Add(customer);
        await dbContext.SaveChangesAsync(cancellationToken);
        return CreatedAtAction(nameof(GetById), new { id = customer.Id }, customer);
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<Customer>> GetById(Guid id, CancellationToken cancellationToken)
    {
        var customer = await dbContext.Customers.AsNoTracking()
            .Include(x => x.Region).Include(x => x.Seller)
            .SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        return customer is null ? NotFound() : Ok(customer);
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<Customer>> Update(Guid id, CreateCustomerRequest request, CancellationToken cancellationToken)
    {
        var customer = await dbContext.Customers.SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (customer is null) return NotFound();

        if (!await dbContext.Regions.AnyAsync(x => x.Id == request.RegionId && x.IsActive, cancellationToken))
            return BadRequest(new ValidationProblemDetails(
                new Dictionary<string, string[]> { ["regionId"] = ["Região inválida ou inativa."] }));

        if (!await dbContext.Sellers.AnyAsync(x => x.Id == request.SellerId && x.IsActive, cancellationToken))
            return BadRequest(new ValidationProblemDetails(
                new Dictionary<string, string[]> { ["sellerId"] = ["Vendedor inválido ou inativo."] }));

        customer.LegalName = request.LegalName.Trim();
        customer.TradeName = request.TradeName?.Trim();
        customer.TaxId = request.TaxId.Trim();
        customer.StateRegistration = request.StateRegistration?.Trim();
        customer.Phone = request.Phone?.Trim();
        customer.Email = request.Email?.Trim();
        customer.Street = request.Street.Trim();
        customer.Number = request.Number.Trim();
        customer.Complement = request.Complement?.Trim();
        customer.District = request.District.Trim();
        customer.City = request.City.Trim();
        customer.State = request.State.Trim().ToUpperInvariant();
        customer.PostalCode = request.PostalCode.Trim();
        customer.RegionId = request.RegionId;
        customer.SellerId = request.SellerId;
        customer.IsActive = true;
        customer.UpdatedAt = DateTimeOffset.UtcNow;

        await dbContext.SaveChangesAsync(cancellationToken);
        return Ok(await dbContext.Customers.AsNoTracking()
            .Include(x => x.Region)
            .Include(x => x.Seller)
            .SingleAsync(x => x.Id == id, cancellationToken));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        var customer = await dbContext.Customers.SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (customer is null) return NotFound();

        customer.IsActive = false;
        customer.UpdatedAt = DateTimeOffset.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
        return NoContent();
    }
}
