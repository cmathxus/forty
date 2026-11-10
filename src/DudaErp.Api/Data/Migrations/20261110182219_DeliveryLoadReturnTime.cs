using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace DudaErp.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class DeliveryLoadReturnTime : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ReturnRecordedAt",
                table: "DeliveryLoads",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ReturnRecordedBy",
                table: "DeliveryLoads",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ReturnedAt",
                table: "DeliveryLoads",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ReturnRecordedAt",
                table: "DeliveryLoads");

            migrationBuilder.DropColumn(
                name: "ReturnRecordedBy",
                table: "DeliveryLoads");

            migrationBuilder.DropColumn(
                name: "ReturnedAt",
                table: "DeliveryLoads");
        }
    }
}
