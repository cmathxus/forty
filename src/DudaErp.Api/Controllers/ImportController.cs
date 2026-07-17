using System.Data;
using System.Globalization;
using System.Text;
using DudaErp.Api.Data;
using DudaErp.Api.Domain;
using ExcelDataReader;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace DudaErp.Api.Controllers;

[ApiController]
[Route("api/import")]
public sealed class ImportController(AppDbContext dbContext) : ControllerBase
{
    [HttpPost("customers")]
    [RequestSizeLimit(20_000_000)]
    public async Task<ActionResult<object>> ImportCustomers(IFormFile file, CancellationToken cancellationToken)
    {
        if (file.Length == 0)
        {
            return BadRequest("Arquivo vazio.");
        }

        var table = ReadFirstTable(file);
        var region = await GetOrCreateRegionAsync("Importado", cancellationToken);
        var seller = await GetOrCreateSellerAsync("DIRETO", "Direto", cancellationToken);

        var created = 0;
        var updated = 0;
        var skipped = 0;
        var duplicatedInFile = 0;
        var seenTaxIds = new HashSet<string>();

        foreach (DataRow row in table.Rows)
        {
            var taxId = Digits(Cell(row, "cnpj", "cpf"));
            var legalName = Cell(row, "nome", "razao", "social");

            if (string.IsNullOrWhiteSpace(taxId) || string.IsNullOrWhiteSpace(legalName))
            {
                skipped++;
                continue;
            }

            if (!seenTaxIds.Add(taxId))
            {
                duplicatedInFile++;
                continue;
            }

            var customer = await dbContext.Customers.SingleOrDefaultAsync(x => x.TaxId == taxId, cancellationToken);
            if (customer is null)
            {
                customer = new Customer
                {
                    LegalName = legalName,
                    TaxId = taxId,
                    Street = ValueOrDefault(Cell(row, "endereco"), "Nao informado"),
                    Number = ValueOrDefault(Cell(row, "numero"), "S/N"),
                    District = ValueOrDefault(Cell(row, "bairro"), "Nao informado"),
                    City = ValueOrDefault(Cell(row, "cidade"), "Sao Paulo"),
                    State = ValueOrDefault(Cell(row, "uf"), "SP").ToUpperInvariant()[..2],
                    PostalCode = "00000000",
                    RegionId = region.Id,
                    SellerId = seller.Id
                };
                dbContext.Customers.Add(customer);
                created++;
            }
            else
            {
                customer.UpdatedAt = DateTimeOffset.UtcNow;
                updated++;
            }

            customer.LegalName = legalName;
            customer.Phone = FirstFilled(Cell(row, "telefone"), Cell(row, "celular"));
            customer.Email = CleanOptional(Cell(row, "email"));
            customer.Street = ValueOrDefault(Cell(row, "endereco"), customer.Street);
            customer.Number = ValueOrDefault(Cell(row, "numero"), customer.Number);
            customer.District = ValueOrDefault(Cell(row, "bairro"), customer.District);
            customer.City = ValueOrDefault(Cell(row, "cidade"), customer.City);
            customer.State = ValueOrDefault(Cell(row, "uf"), customer.State).ToUpperInvariant()[..2];
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return Ok(new { created, updated, skipped, duplicatedInFile, defaultRegion = region.Name, defaultSeller = seller.Code });
    }

    [HttpPost("products")]
    [RequestSizeLimit(20_000_000)]
    public async Task<ActionResult<object>> ImportProducts(IFormFile file, CancellationToken cancellationToken)
    {
        if (file.Length == 0)
        {
            return BadRequest("Arquivo vazio.");
        }

        var table = ReadTable(file, "Omie_Import") ?? ReadFirstTable(file);
        var created = 0;
        var updated = 0;
        var skipped = 0;
        var duplicatedInFile = 0;
        var seenCodes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (DataRow row in table.Rows)
        {
            var code = Cell(row, "codigo", "codigodoproduto");
            var name = Cell(row, "descricao", "descricaodoproduto");
            var boxPrice = DecimalOrNull(Cell(row, "preco_caixa", "precoporcaixa"));
            var unitPrice = DecimalOrNull(Cell(row, "preco_venda", "precoporunidade"));

            if (string.IsNullOrWhiteSpace(code) || string.IsNullOrWhiteSpace(name) || boxPrice is null)
            {
                skipped++;
                continue;
            }

            if (!seenCodes.Add(code))
            {
                duplicatedInFile++;
                continue;
            }

            var product = await dbContext.Products.SingleOrDefaultAsync(x => x.Code == code, cancellationToken);
            if (product is null)
            {
                product = new Product
                {
                    Code = code,
                    Name = name,
                    Unit = "FD",
                    SalePrice = boxPrice.Value,
                    WeightInKg = 0
                };
                dbContext.Products.Add(product);
                created++;
            }
            else
            {
                product.UpdatedAt = DateTimeOffset.UtcNow;
                updated++;
            }

            product.Name = name;
            product.Unit = "FD";
            product.SalePrice = boxPrice.Value;
            product.UnitSalePrice = unitPrice;
            product.UnitBarcode = Cell(row, "ean", "codigodebarrasporunidade");
            product.BoxBarcode = Cell(row, "dun", "codigodebarrasporcaixa");
            product.Ncm = Cell(row, "ncm", "codigoncm");
            product.Cest = Cell(row, "cest", "codigocest");
            product.BlockKType = Cell(row, "blocok", "tipoitemsped", "tipodoproduto");
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return Ok(new { created, updated, skipped, duplicatedInFile, priceUsedForOrders = "preco_caixa" });
    }

    private async Task<Region> GetOrCreateRegionAsync(string name, CancellationToken cancellationToken)
    {
        var region = await dbContext.Regions.SingleOrDefaultAsync(x => x.Name == name, cancellationToken);
        if (region is not null)
        {
            return region;
        }

        region = new Region { Name = name };
        dbContext.Regions.Add(region);
        await dbContext.SaveChangesAsync(cancellationToken);
        return region;
    }

    private async Task<Seller> GetOrCreateSellerAsync(string code, string name, CancellationToken cancellationToken)
    {
        var seller = await dbContext.Sellers.SingleOrDefaultAsync(x => x.Code == code, cancellationToken);
        if (seller is not null)
        {
            return seller;
        }

        seller = new Seller { Code = code, Name = name };
        dbContext.Sellers.Add(seller);
        await dbContext.SaveChangesAsync(cancellationToken);
        return seller;
    }

    private static DataTable ReadFirstTable(IFormFile file)
    {
        var dataSet = ReadWorkbook(file);
        return dataSet.Tables.Cast<DataTable>().First(x => x.Rows.Count > 0);
    }

    private static DataTable? ReadTable(IFormFile file, string sheetName)
    {
        var dataSet = ReadWorkbook(file);
        return dataSet.Tables.Cast<DataTable>()
            .FirstOrDefault(x => string.Equals(x.TableName, sheetName, StringComparison.OrdinalIgnoreCase));
    }

    private static DataSet ReadWorkbook(IFormFile file)
    {
        Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
        using var stream = file.OpenReadStream();
        using var reader = ExcelReaderFactory.CreateReader(stream);
        return reader.AsDataSet(new ExcelDataSetConfiguration
        {
            ConfigureDataTable = _ => new ExcelDataTableConfiguration { UseHeaderRow = true }
        });
    }

    private static string Cell(DataRow row, params string[] candidates)
    {
        foreach (DataColumn column in row.Table.Columns)
        {
            var normalizedColumn = Normalize(column.ColumnName);
            if (candidates.Any(candidate => normalizedColumn.Contains(Normalize(candidate), StringComparison.Ordinal)))
            {
                return CellText(row[column]);
            }
        }

        return "";
    }

    private static string CellText(object? value)
    {
        if (value is null || value == DBNull.Value)
        {
            return "";
        }

        return value switch
        {
            double number when Math.Abs(number % 1) < 0.0000001 => number.ToString("0", CultureInfo.InvariantCulture),
            double number => number.ToString(CultureInfo.InvariantCulture),
            decimal number => number.ToString(CultureInfo.InvariantCulture),
            _ => value.ToString()?.Trim() ?? ""
        };
    }

    private static string Normalize(string value)
    {
        var decomposed = value.Normalize(NormalizationForm.FormD).ToLowerInvariant();
        var builder = new StringBuilder(decomposed.Length);
        foreach (var ch in decomposed)
        {
            var category = CharUnicodeInfo.GetUnicodeCategory(ch);
            if (category != UnicodeCategory.NonSpacingMark && char.IsLetterOrDigit(ch))
            {
                builder.Append(ch);
            }
        }

        return builder.ToString();
    }

    private static string Digits(string value) => new(value.Where(char.IsDigit).ToArray());

    private static decimal? DecimalOrNull(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var clean = value.Replace("R$", "", StringComparison.OrdinalIgnoreCase).Trim();
        if (clean.Contains('.') && !clean.Contains(',') &&
            decimal.TryParse(clean, NumberStyles.Number, CultureInfo.InvariantCulture, out var dottedInvariant))
        {
            return dottedInvariant;
        }

        if (decimal.TryParse(clean, NumberStyles.Number, CultureInfo.GetCultureInfo("pt-BR"), out var br))
        {
            return br;
        }

        return decimal.TryParse(clean, NumberStyles.Number, CultureInfo.InvariantCulture, out var invariant)
            ? invariant
            : null;
    }

    private static string ValueOrDefault(string value, string fallback) =>
        string.IsNullOrWhiteSpace(CleanOptional(value)) ? fallback : CleanOptional(value)!;

    private static string? CleanOptional(string value)
    {
        var clean = value.Trim();
        return string.IsNullOrWhiteSpace(clean) || clean == "." ? null : clean;
    }

    private static string? FirstFilled(params string[] values) =>
        values.Select(CleanOptional).FirstOrDefault(x => !string.IsNullOrWhiteSpace(x));
}
