using DudaErp.Api.Contracts;
using DudaErp.Api.Data;
using DudaErp.Api.Domain;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace DudaErp.Api.Controllers;

[ApiController]
[Route("api/financial")]
public sealed class FinancialController(AppDbContext dbContext) : ControllerBase
{
    [HttpGet("payables")]
    public Task<List<AccountPayable>> GetPayables(CancellationToken cancellationToken) =>
        dbContext.AccountsPayable.AsNoTracking()
            .OrderBy(x => x.Status)
            .ThenBy(x => x.DueDate)
            .ToListAsync(cancellationToken);

    [HttpPost("payables")]
    public async Task<ActionResult<AccountPayable>> CreatePayable(CreateAccountPayableRequest request, CancellationToken cancellationToken)
    {
        var payable = new AccountPayable
        {
            Description = request.Description.Trim(),
            SupplierName = request.SupplierName?.Trim(),
            DueDate = request.DueDate,
            Amount = request.Amount,
            Notes = request.Notes?.Trim()
        };
        dbContext.AccountsPayable.Add(payable);
        await dbContext.SaveChangesAsync(cancellationToken);
        return Created($"/api/financial/payables/{payable.Id}", payable);
    }

    [HttpPut("payables/{id:guid}")]
    public async Task<ActionResult<AccountPayable>> UpdatePayable(Guid id, CreateAccountPayableRequest request, CancellationToken cancellationToken)
    {
        var payable = await dbContext.AccountsPayable.SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (payable is null) return NotFound();

        payable.Description = request.Description.Trim();
        payable.SupplierName = request.SupplierName?.Trim();
        payable.DueDate = request.DueDate;
        payable.Amount = request.Amount;
        payable.Notes = request.Notes?.Trim();
        payable.UpdatedAt = DateTimeOffset.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
        return Ok(payable);
    }

    [HttpPost("payables/{id:guid}/pay")]
    public async Task<ActionResult<AccountPayable>> Pay(Guid id, SettleAccountRequest request, CancellationToken cancellationToken)
    {
        var payable = await dbContext.AccountsPayable.SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (payable is null) return NotFound();

        payable.Status = PayableStatus.Paid;
        payable.PaidDate = request.Date ?? DateOnly.FromDateTime(DateTime.Today);
        payable.UpdatedAt = DateTimeOffset.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
        return Ok(payable);
    }

    [HttpDelete("payables/{id:guid}")]
    public async Task<IActionResult> DeletePayable(Guid id, CancellationToken cancellationToken)
    {
        var payable = await dbContext.AccountsPayable.SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (payable is null) return NotFound();

        dbContext.AccountsPayable.Remove(payable);
        await dbContext.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    [HttpGet("receivables")]
    public Task<List<AccountReceivable>> GetReceivables(CancellationToken cancellationToken) =>
        dbContext.AccountsReceivable.AsNoTracking()
            .Include(x => x.Customer)
            .OrderBy(x => x.Status)
            .ThenBy(x => x.DueDate)
            .ToListAsync(cancellationToken);

    [HttpPost("receivables")]
    public async Task<ActionResult<AccountReceivable>> CreateReceivable(CreateAccountReceivableRequest request, CancellationToken cancellationToken)
    {
        if (request.CustomerId is not null &&
            !await dbContext.Customers.AnyAsync(x => x.Id == request.CustomerId && x.IsActive, cancellationToken))
        {
            return BadRequest(new ValidationProblemDetails(new Dictionary<string, string[]> { ["customerId"] = ["Cliente invalido ou inativo."] }));
        }

        var receivable = new AccountReceivable
        {
            Description = request.Description.Trim(),
            CustomerId = request.CustomerId,
            OrderNumber = request.OrderNumber,
            DueDate = request.DueDate,
            Amount = request.Amount,
            Notes = request.Notes?.Trim()
        };
        dbContext.AccountsReceivable.Add(receivable);
        await dbContext.SaveChangesAsync(cancellationToken);
        return Created($"/api/financial/receivables/{receivable.Id}", receivable);
    }

    [HttpPut("receivables/{id:guid}")]
    public async Task<ActionResult<AccountReceivable>> UpdateReceivable(Guid id, CreateAccountReceivableRequest request, CancellationToken cancellationToken)
    {
        var receivable = await dbContext.AccountsReceivable.SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (receivable is null) return NotFound();

        receivable.Description = request.Description.Trim();
        receivable.CustomerId = request.CustomerId;
        receivable.OrderNumber = request.OrderNumber;
        receivable.DueDate = request.DueDate;
        receivable.Amount = request.Amount;
        receivable.Notes = request.Notes?.Trim();
        receivable.UpdatedAt = DateTimeOffset.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
        return Ok(receivable);
    }

    [HttpPost("receivables/{id:guid}/receive")]
    public async Task<ActionResult<AccountReceivable>> Receive(Guid id, SettleAccountRequest request, CancellationToken cancellationToken)
    {
        var receivable = await dbContext.AccountsReceivable.SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (receivable is null) return NotFound();

        receivable.Status = ReceivableStatus.Received;
        receivable.ReceivedDate = request.Date ?? DateOnly.FromDateTime(DateTime.Today);
        receivable.UpdatedAt = DateTimeOffset.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
        return Ok(receivable);
    }

    [HttpDelete("receivables/{id:guid}")]
    public async Task<IActionResult> DeleteReceivable(Guid id, CancellationToken cancellationToken)
    {
        var receivable = await dbContext.AccountsReceivable.SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (receivable is null) return NotFound();

        dbContext.AccountsReceivable.Remove(receivable);
        await dbContext.SaveChangesAsync(cancellationToken);
        return NoContent();
    }
}
