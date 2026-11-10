using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;

namespace DudaErp.Api.Contracts;

public sealed class PageQuery
{
    [Range(1, 1000000)] public int Page { get; set; } = 1;
    [Range(20, 20)] public int PageSize { get; set; } = 20;
    [StringLength(200)] public string? Search { get; set; }

    // A busca é literal: % e _ digitados não viram curingas SQL.
    public string Pattern => "%" + (Search?.Trim() ?? "").Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_") + "%";
    public bool HasSearch => !string.IsNullOrWhiteSpace(Search);
}

public sealed record PageResult<T>(List<T> Items, int Total, int Page, int PageSize, int TotalPages);

public static class QueryPagination
{
    // A consulta deve chegar ordenada, antes de eventual projeção para DTO.
    public static async Task<PageResult<T>> ReadPageAsync<T>(this IQueryable<T> query, PageQuery request, CancellationToken ct)
    {
        const int size = 20;
        var total = await query.CountAsync(ct);
        var pages = Math.Max(1, (int)Math.Ceiling(total / (double)size));
        var page = Math.Clamp(request.Page, 1, pages);
        var rows = await query.Skip((page - 1) * size).Take(size).ToListAsync(ct);
        return new(rows, total, page, size, pages);
    }
}
