using Microsoft.AspNetCore.Authorization;
using DudaErp.Api.Data;
using DudaErp.Api.Domain;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace DudaErp.Api.Controllers;

[ApiController]
[Authorize(Policy = "users.manage")]
[Route("api/demo")]
public sealed class DemoController(AppDbContext dbContext) : ControllerBase
{
    [HttpPost("seed")]
    public async Task<IActionResult> Seed(CancellationToken cancellationToken)
    {
        var region = await dbContext.Regions.SingleOrDefaultAsync(x => x.Name == "Osasco", cancellationToken);
        if (region is null)
        {
            region = new Region { Name = "Osasco" };
            dbContext.Regions.Add(region);
        }

        var seller = await dbContext.Sellers.SingleOrDefaultAsync(x => x.Code == "FABIO", cancellationToken);
        if (seller is null)
        {
            seller = new Seller { Code = "FABIO", Name = "Fabio", DefaultCommissionPercentage = 3 };
            dbContext.Sellers.Add(seller);
        }

        var vehicle = await dbContext.Vehicles.SingleOrDefaultAsync(x => x.Plate == "ABC1D23", cancellationToken);
        if (vehicle is null)
        {
            vehicle = new Vehicle { Name = "Kangoo Lucas", Plate = "ABC1D23", Model = "Renault Kangoo" };
            dbContext.Vehicles.Add(vehicle);
        }

        var product = await dbContext.Products.SingleOrDefaultAsync(x => x.Code == "4300", cancellationToken);
        if (product is null)
        {
            product = new Product
            {
                Code = "4300",
                Name = "Pipoca 40 GRS C/30 UNID",
                Unit = "FD",
                SalePrice = 19.80m,
                UnitSalePrice = 0.66m,
                WeightInKg = 0.9m,
                UnitBarcode = "7898667960000",
                BoxBarcode = "7898667964300",
                Ncm = "19041000",
                Cfop = "5101",
                Cest = "1703000",
                BlockKType = "04 - Produto Acabado",
                IcmsCst = "000",
                IcmsRate = 18
            };
            dbContext.Products.Add(product);
        }

        await dbContext.SaveChangesAsync(cancellationToken);

        var customerExists = await dbContext.Customers.AnyAsync(x => x.TaxId == "55730725000127", cancellationToken);
        if (!customerExists)
        {
            dbContext.Customers.Add(new Customer
            {
                LegalName = "Casa de Doces Deusdado Ltda ME",
                TaxId = "55730725000127",
                StateRegistration = "111482874112",
                Phone = "1122017418",
                Street = "Rua Jose Borges de Paula",
                Number = "37",
                District = "Vila Sabrina",
                City = "Sao Paulo",
                State = "SP",
                PostalCode = "02220310",
                RegionId = region.Id,
                SellerId = seller.Id
            });
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return Ok(new { message = "Dados de demonstracao carregados." });
    }
}
