using Microsoft.AspNetCore.Authorization;
using DudaErp.Api.Contracts;
using DudaErp.Api.Data;
using DudaErp.Api.Domain;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using DudaErp.Api.Services;
using System.Security.Claims;

namespace DudaErp.Api.Controllers;

[ApiController]
[Route("api/financial")]
public sealed class FinancialController(AppDbContext dbContext) : ControllerBase
{
    private Guid? ActorId => Guid.TryParse(User?.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;

    [HttpGet("customers/{id:guid}/summary"), Authorize(Policy = "finance.customer")]
    public async Task<IActionResult> CustomerSummary(Guid id, CancellationToken ct)
    {
        var customer = await dbContext.Customers.AsNoTracking().Where(x => x.Id == id)
            .Select(x => x.LegalName).SingleOrDefaultAsync(ct);
        if (customer is null) return NotFound();
        var orders = await dbContext.Orders.CountAsync(x => x.CustomerId == id && x.Status != OrderStatus.Cancelled, ct);
        var receivables = dbContext.AccountsReceivable.Where(x => x.CustomerId == id);
        var onTime = await receivables.CountAsync(x => x.Status == ReceivableStatus.Received && x.ReceivedDate <= x.DueDate, ct);
        var late = await receivables.CountAsync(x => x.Status == ReceivableStatus.Received && x.ReceivedDate > x.DueDate, ct);
        var open = await receivables.CountAsync(x => x.Status == ReceivableStatus.Open, ct);
        return Ok(new { customer, orders, onTime, late, open });
    }

    [HttpGet("payables"), Authorize(Policy = "payables.read")]
    public Task<List<AccountPayable>> GetPayables(CancellationToken cancellationToken) =>
        dbContext.AccountsPayable.AsNoTracking()
            .OrderBy(x => x.Status)
            .ThenBy(x => x.DueDate)
            .ToListAsync(cancellationToken);

    [HttpPost("payables"), Authorize(Policy = "payables.create")]
    public async Task<ActionResult<AccountPayable>> CreatePayable(CreateAccountPayableRequest request, CancellationToken cancellationToken)
    {
        if (ActorId is not Guid actor) return Unauthorized();
        var payable = new AccountPayable
        {
            Description = request.Description.Trim(),
            SupplierName = request.SupplierName?.Trim(),
            DueDate = request.DueDate,
            Amount = request.Amount,
            CreatedById = actor,
            CreatedBy = User.Identity?.Name,
            Notes = request.Notes?.Trim()
        };
        dbContext.AccountsPayable.Add(payable);
        await dbContext.SaveChangesAsync(cancellationToken);
        return Created($"/api/financial/payables/{payable.Id}", payable);
    }

    [HttpPut("payables/{id:guid}"), Authorize(Policy = "payables.edit")]
    public async Task<ActionResult<AccountPayable>> UpdatePayable(Guid id, CreateAccountPayableRequest request, CancellationToken cancellationToken)
    {
        await using var transaction = await new InventoryService(dbContext).BeginWriteAsync(cancellationToken);
        var payable = await dbContext.AccountsPayable.SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (payable is null) return NotFound();
        if (payable.Status != PayableStatus.Open)
            return Conflict(new { detail = "Contas já baixadas não podem ser alteradas, excluídas ou baixadas novamente." });

        payable.Description = request.Description.Trim();
        payable.SupplierName = request.SupplierName?.Trim();
        payable.DueDate = request.DueDate;
        payable.Amount = request.Amount;
        payable.Notes = request.Notes?.Trim();
        payable.UpdatedAt = DateTimeOffset.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
        if (transaction is not null) await transaction.CommitAsync(cancellationToken);
        return Ok(payable);
    }

    [HttpPost("payables/{id:guid}/pay"), Authorize(Policy = "payables.pay")]
    public async Task<ActionResult<AccountPayable>> Pay(Guid id, SettleAccountRequest request, CancellationToken cancellationToken)
    {
        await using var transaction = await new InventoryService(dbContext).BeginWriteAsync(cancellationToken);
        var payable = await dbContext.AccountsPayable.SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (payable is null) return NotFound();
        if (payable.CreatedById is Guid author && author == ActorId)
            return Conflict(new { detail = "Quem lançou a despesa não pode registrar o pagamento." });
        if (payable.Status != PayableStatus.Open)
            return Conflict(new { detail = "Contas já baixadas não podem ser alteradas, excluídas ou baixadas novamente." });

        payable.Status = PayableStatus.Paid;
        payable.PaidBy = User?.Identity?.Name;
        payable.PaidDate = request.Date ?? DateOnly.FromDateTime(DateTime.Today);
        payable.UpdatedAt = DateTimeOffset.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
        if (transaction is not null) await transaction.CommitAsync(cancellationToken);
        return Ok(payable);
    }

    [HttpPost("payables/{id:guid}/check"), Authorize(Policy = "payables.check")]
    public async Task<IActionResult> CheckPayable(Guid id, CancellationToken ct)
    {
        await using var transaction = await new InventoryService(dbContext).BeginWriteAsync(ct);
        var payable = await dbContext.AccountsPayable.SingleOrDefaultAsync(x => x.Id == id, ct);
        if (payable is null) return NotFound();
        if (payable.CreatedById is Guid author && author == ActorId)
            return Conflict(new { detail = "Quem lançou a despesa não pode conferir o pagamento." });
        if (payable.Status != PayableStatus.Paid || payable.CheckedAt is not null)
            return Conflict(new { detail = "Somente pagamentos ainda não conferidos podem ser conferidos." });
        payable.CheckedAt = DateTimeOffset.UtcNow;
        payable.CheckedBy = User?.Identity?.Name;
        await dbContext.SaveChangesAsync(ct);
        if (transaction is not null) await transaction.CommitAsync(ct);
        return NoContent();
    }

    [HttpDelete("payables/{id:guid}"), Authorize(Policy = "payables.delete")]
    public async Task<IActionResult> DeletePayable(Guid id, CancellationToken cancellationToken)
    {
        await using var transaction = await new InventoryService(dbContext).BeginWriteAsync(cancellationToken);
        var payable = await dbContext.AccountsPayable.SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (payable is null) return NotFound();
        if (payable.Status != PayableStatus.Open)
            return Conflict(new { detail = "Contas já baixadas não podem ser alteradas, excluídas ou baixadas novamente." });

        dbContext.AccountsPayable.Remove(payable);
        await dbContext.SaveChangesAsync(cancellationToken);
        if (transaction is not null) await transaction.CommitAsync(cancellationToken);
        return NoContent();
    }

    [HttpGet("receivables"), Authorize(Policy = "receivables.read")]
    public Task<List<AccountReceivable>> GetReceivables(CancellationToken cancellationToken) =>
        dbContext.AccountsReceivable.AsNoTracking()
            .Include(x => x.Customer)
            .OrderBy(x => x.Status)
            .ThenBy(x => x.DueDate)
            .ToListAsync(cancellationToken);

    [HttpPost("receivables"), Authorize(Policy = "receivables.create")]
    public async Task<ActionResult<AccountReceivable>> CreateReceivable(CreateAccountReceivableRequest request, CancellationToken cancellationToken)
    {
        await using var transaction = await new InventoryService(dbContext).BeginWriteAsync(cancellationToken);
        if (request.OrderNumber is long number && await dbContext.AccountsReceivable.AnyAsync(x => x.OrderNumber == number && x.BilledOrderId != null, cancellationToken))
            return Conflict(new { detail = "Este pedido já possui uma conta a receber gerada pelo faturamento." });
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
        if (transaction is not null) await transaction.CommitAsync(cancellationToken);
        return Created($"/api/financial/receivables/{receivable.Id}", receivable);
    }

    [HttpPut("receivables/{id:guid}"), Authorize(Policy = "receivables.edit")]
    public async Task<ActionResult<AccountReceivable>> UpdateReceivable(Guid id, CreateAccountReceivableRequest request, CancellationToken cancellationToken)
    {
        await using var transaction = await new InventoryService(dbContext).BeginWriteAsync(cancellationToken);
        var receivable = await dbContext.AccountsReceivable.SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (receivable is null) return NotFound();
        if (receivable.BilledOrderId is not null)
            return Conflict(new { detail = "A conta gerada pelo faturamento faz parte do histórico da venda." });
        if (request.OrderNumber is long number && await dbContext.AccountsReceivable.AnyAsync(x => x.OrderNumber == number && x.BilledOrderId != null, cancellationToken))
            return Conflict(new { detail = "Este pedido já possui uma conta a receber gerada pelo faturamento." });
        if (receivable.Status != ReceivableStatus.Open)
            return Conflict(new { detail = "Contas já baixadas não podem ser alteradas, excluídas ou baixadas novamente." });

        receivable.Description = request.Description.Trim();
        receivable.CustomerId = request.CustomerId;
        receivable.OrderNumber = request.OrderNumber;
        receivable.DueDate = request.DueDate;
        receivable.Amount = request.Amount;
        receivable.Notes = request.Notes?.Trim();
        receivable.UpdatedAt = DateTimeOffset.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
        if (transaction is not null) await transaction.CommitAsync(cancellationToken);
        return Ok(receivable);
    }

    [HttpPost("receivables/{id:guid}/receive"), Authorize(Policy = "receivables.receive")]
    public async Task<ActionResult<AccountReceivable>> Receive(Guid id, SettleAccountRequest request, CancellationToken cancellationToken)
    {
        var receivable = await dbContext.AccountsReceivable.SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (receivable is null) return NotFound();
        if (receivable.Status != ReceivableStatus.Open)
            return Conflict(new { detail = "Contas já baixadas não podem ser alteradas, excluídas ou baixadas novamente." });

        receivable.Status = ReceivableStatus.Received;
        receivable.ReceivedDate = request.Date ?? DateOnly.FromDateTime(DateTime.Today);
        receivable.UpdatedAt = DateTimeOffset.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
        return Ok(receivable);
    }

    [HttpDelete("receivables/{id:guid}"), Authorize(Policy = "receivables.delete")]
    public async Task<IActionResult> DeleteReceivable(Guid id, CancellationToken cancellationToken)
    {
        var receivable = await dbContext.AccountsReceivable.SingleOrDefaultAsync(x => x.Id == id, cancellationToken);
        if (receivable is null) return NotFound();
        if (receivable.BilledOrderId is not null)
            return Conflict(new { detail = "A conta gerada pelo faturamento faz parte do histórico da venda." });
        if (receivable.Status != ReceivableStatus.Open)
            return Conflict(new { detail = "Contas já baixadas não podem ser alteradas, excluídas ou baixadas novamente." });

        dbContext.AccountsReceivable.Remove(receivable);
        await dbContext.SaveChangesAsync(cancellationToken);
        return NoContent();
    }
}
