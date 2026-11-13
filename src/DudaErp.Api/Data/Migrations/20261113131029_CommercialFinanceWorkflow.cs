using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace DudaErp.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class CommercialFinanceWorkflow : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "OrderId",
                table: "ProductionPlans",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "OrderNumber",
                table: "ProductionPlans",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ApprovedAt",
                table: "Orders",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ApprovedBy",
                table: "Orders",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ApprovedById",
                table: "Orders",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "BilledAt",
                table: "Orders",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "RequiresCommercialWorkflow",
                table: "Orders",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<Guid>(
                name: "BilledOrderId",
                table: "AccountsReceivable",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "CheckedAt",
                table: "AccountsPayable",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CheckedBy",
                table: "AccountsPayable",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CreatedBy",
                table: "AccountsPayable",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "CreatedById",
                table: "AccountsPayable",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PaidBy",
                table: "AccountsPayable",
                type: "text",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_ProductionPlans_OrderId",
                table: "ProductionPlans",
                column: "OrderId");

            migrationBuilder.CreateIndex(
                name: "IX_AccountsReceivable_BilledOrderId",
                table: "AccountsReceivable",
                column: "BilledOrderId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_ProductionPlans_OrderId",
                table: "ProductionPlans");

            migrationBuilder.DropIndex(
                name: "IX_AccountsReceivable_BilledOrderId",
                table: "AccountsReceivable");

            migrationBuilder.DropColumn(
                name: "OrderId",
                table: "ProductionPlans");

            migrationBuilder.DropColumn(
                name: "OrderNumber",
                table: "ProductionPlans");

            migrationBuilder.DropColumn(
                name: "ApprovedAt",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "ApprovedBy",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "ApprovedById",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "BilledAt",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "RequiresCommercialWorkflow",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "BilledOrderId",
                table: "AccountsReceivable");

            migrationBuilder.DropColumn(
                name: "CheckedAt",
                table: "AccountsPayable");

            migrationBuilder.DropColumn(
                name: "CheckedBy",
                table: "AccountsPayable");

            migrationBuilder.DropColumn(
                name: "CreatedBy",
                table: "AccountsPayable");

            migrationBuilder.DropColumn(
                name: "CreatedById",
                table: "AccountsPayable");

            migrationBuilder.DropColumn(
                name: "PaidBy",
                table: "AccountsPayable");
        }
    }
}
