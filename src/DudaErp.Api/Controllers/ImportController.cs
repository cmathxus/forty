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
    public sealed record RowWarning(int Row, string Reason);

    [HttpPost("customers")]
    [RequestSizeLimit(20_000_000)]
    public async Task<ActionResult<object>> ImportCustomers(IFormFile file, CancellationToken cancellationToken)
    {
        if (file.Length == 0) return BadRequest("Arquivo vazio.");
        var table = ReadFirstTable(file);
        await using var transaction = dbContext.Database.IsRelational() && dbContext.Database.CurrentTransaction is null
            ? await dbContext.Database.BeginTransactionAsync(cancellationToken) : null;
        var region = await GetOrCreateRegionAsync("Importado", cancellationToken);
        var seller = await GetOrCreateSellerAsync("DIRETO", "Direto", cancellationToken);
        var existing = new Dictionary<string, Customer>();
        foreach (var item in await dbContext.Customers.ToListAsync(cancellationToken))
        {
            if (!existing.TryAdd(Digits(item.TaxId), item))
                throw new InvalidOperationException("Existem clientes com o mesmo CPF/CNPJ em formatos diferentes. Revise os cadastros antes de importar.");
        }
        var created = 0;
        var updated = 0;
        var skipped = 0;
        var duplicatedInFile = 0;
        var seen = new HashSet<string>();
        var warnings = new List<RowWarning>();
        var rowNumber = 1;
        foreach (DataRow row in table.Rows)
        {
            rowNumber++;
            var taxId = Digits(Cell(row, "cnpj", "cpf"));
            var name = Cell(row, "nome", "razao", "social");
            if (string.IsNullOrWhiteSpace(name) || taxId.Length is not (11 or 14))
            {
                skipped++;
                warnings.Add(new(rowNumber, "Linha ignorada: informe o nome e CPF com 11 dígitos ou CNPJ com 14 dígitos."));
                continue;
            }
            if (!seen.Add(taxId)) { duplicatedInFile++; continue; }
            if (!existing.TryGetValue(taxId, out var customer))
            {
                customer = new Customer { LegalName = name, TaxId = taxId,
                    Street = "Não informado", Number = "Não informado", District = "Não informado",
                    City = "Não informado", State = "--", PostalCode = "", RegionId = region.Id, SellerId = seller.Id };
                existing.Add(taxId, customer);
                dbContext.Customers.Add(customer);
                created++;
            }
            else { updated++; customer.UpdatedAt = DateTimeOffset.UtcNow; }
            customer.LegalName = name;
            customer.TaxId = taxId;
            var phones = new[] { CleanOptional(Cell(row, "telefone")), CleanOptional(Cell(row, "celular")) }
                .Where(x => x is not null).Distinct().ToArray();
            if (phones.Length > 0) customer.Phone = string.Join(" / ", phones);
            customer.Email = FirstFilled(Cell(row, "email"), customer.Email ?? "");
            customer.TradeName = FirstFilled(Cell(row, "nomefantasia"), customer.TradeName ?? "");
            customer.StateRegistration = FirstFilled(Cell(row, "inscricaoestadual", "ie"), customer.StateRegistration ?? "");
            customer.Street = ValueOrDefault(Cell(row, "endereco", "logradouro"), customer.Street);
            customer.Number = ValueOrDefault(Cell(row, "numero"), customer.Number);
            customer.Complement = FirstFilled(Cell(row, "complemento"), customer.Complement ?? "");
            customer.District = ValueOrDefault(Cell(row, "bairro"), customer.District);
            customer.City = ValueOrDefault(Cell(row, "cidade"), customer.City);
            var state = CleanOptional(Cell(row, "uf"));
            if (state?.Length == 2) customer.State = state.ToUpperInvariant();
            var postalCode = Digits(Cell(row, "cep"));
            if (postalCode.Length > 0) customer.PostalCode = postalCode;
            if (customer.Street == "Não informado" || customer.State == "--")
                warnings.Add(new(rowNumber, "Cliente importado com endereço incompleto; complete o cadastro antes da entrega."));
        }
        await dbContext.SaveChangesAsync(cancellationToken);
        if (transaction is not null) await transaction.CommitAsync(cancellationToken);
        return Ok(new { created, updated, skipped, duplicatedInFile, defaultRegion = region.Name, defaultSeller = seller.Code, warnings });
    }

    [HttpPost("products")]
    [RequestSizeLimit(20_000_000)]
    public async Task<ActionResult<object>> ImportProducts(IFormFile file, CancellationToken cancellationToken)
    {
        if (file.Length == 0) return BadRequest("Arquivo vazio.");
        var workbook = ReadWorkbook(file);
        var table = workbook.Tables.Cast<DataTable>().FirstOrDefault(x => x.TableName.Equals("Omie_Import", StringComparison.OrdinalIgnoreCase))
            ?? workbook.Tables.Cast<DataTable>().First(x => x.Rows.Count > 0);
        var general = workbook.Tables.Cast<DataTable>().FirstOrDefault(x => x.TableName.Equals("Tabela Geral Produtos", StringComparison.OrdinalIgnoreCase));
        var packaging = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (general is not null)
            foreach (DataRow row in general.Rows)
                packaging.TryAdd(Cell(row, "codigo", "codigodoproduto"), Cell(row, "unidades", "embalagem"));
        var existing = (await dbContext.Products.ToListAsync(cancellationToken)).ToDictionary(x => x.Code, StringComparer.OrdinalIgnoreCase);
        await using var transaction = dbContext.Database.IsRelational() && dbContext.Database.CurrentTransaction is null
            ? await dbContext.Database.BeginTransactionAsync(cancellationToken) : null;
        var created = 0;
        var updated = 0;
        var skipped = 0;
        var duplicatedInFile = 0;
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var warnings = new List<RowWarning>();
        var rowNumber = 1;
        foreach (DataRow row in table.Rows)
        {
            rowNumber++;
            var code = Cell(row, "codigo", "codigodoproduto");
            var name = Cell(row, "descricao", "descricaodoproduto");
            var price = DecimalOrNull(Cell(row, "preco_caixa", "precoporcaixa"));
            if (string.IsNullOrWhiteSpace(code) || string.IsNullOrWhiteSpace(name) || price is null or <= 0)
            {
                skipped++;
                warnings.Add(new(rowNumber, "Produto ignorado: código, descrição e preço por caixa positivo são obrigatórios."));
                continue;
            }
            if (!seen.Add(code)) { duplicatedInFile++; continue; }
            if (packaging.TryGetValue(code, out var pack) && !string.IsNullOrWhiteSpace(pack) && !name.Contains(pack, StringComparison.OrdinalIgnoreCase))
                name = name + " " + pack;
            if (!existing.TryGetValue(code, out var product))
            {
                product = new Product { Code = code, Name = name, Unit = "FD", SalePrice = price.Value, WeightInKg = 0 };
                existing.Add(code, product);
                dbContext.Products.Add(product);
                created++;
            }
            else { updated++; product.UpdatedAt = DateTimeOffset.UtcNow; }
            product.Name = name;
            // O pedido usa preço por caixa/fardo; UN na aba Omie representa a unidade interna.
            product.Unit = "FD";
            product.SalePrice = decimal.Round(price.Value, 2);
            product.UnitSalePrice = DecimalOrNull(Cell(row, "preco_venda", "precoporunidade"));
            product.UnitBarcode = CleanOptional(Cell(row, "ean", "codigodebarrasporunidade"));
            product.BoxBarcode = CleanOptional(Cell(row, "dun", "codigodebarrasporcaixa"));
            product.Ncm = CleanOptional(Cell(row, "ncm", "codigoncm"));
            product.Cest = CleanOptional(Cell(row, "cest", "codigocest"));
            product.BlockKType = CleanOptional(Cell(row, "blocok", "tipoitemsped", "tipodoproduto"));
        }
        await dbContext.SaveChangesAsync(cancellationToken);
        if (transaction is not null) await transaction.CommitAsync(cancellationToken);
        return Ok(new { created, updated, skipped, duplicatedInFile, priceUsedForOrders = "preco_caixa", warnings });
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
