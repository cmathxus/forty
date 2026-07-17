using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace DudaErp.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class SpreadsheetImports : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "BlockKType",
                table: "Products",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "BoxBarcode",
                table: "Products",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "UnitBarcode",
                table: "Products",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "UnitSalePrice",
                table: "Products",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "BlockKType",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "BoxBarcode",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "UnitBarcode",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "UnitSalePrice",
                table: "Products");
        }
    }
}
