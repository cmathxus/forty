using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace DudaErp.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class DeliveryReconciliationAudit : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "DispatchedAt",
                table: "DeliveryLoads",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DispatchedBy",
                table: "DeliveryLoads",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CheckedBy",
                table: "DeliveryLoadOrders",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DispatchedAt",
                table: "DeliveryLoads");

            migrationBuilder.DropColumn(
                name: "DispatchedBy",
                table: "DeliveryLoads");

            migrationBuilder.DropColumn(
                name: "CheckedBy",
                table: "DeliveryLoadOrders");
        }
    }
}
