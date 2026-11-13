using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace DudaErp.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class UserCustomPermissions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string[]>(
                name: "CustomPermissions",
                table: "Users",
                type: "text[]",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CustomPermissions",
                table: "Users");
        }
    }
}
