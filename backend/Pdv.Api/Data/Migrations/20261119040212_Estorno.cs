using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pdv.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class Estorno : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "RefundReason",
                schema: "pdv",
                table: "Payments",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "RefundedAt",
                schema: "pdv",
                table: "Payments",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "RefundedByUserId",
                schema: "pdv",
                table: "Payments",
                type: "integer",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "RefundReason",
                schema: "pdv",
                table: "Payments");

            migrationBuilder.DropColumn(
                name: "RefundedAt",
                schema: "pdv",
                table: "Payments");

            migrationBuilder.DropColumn(
                name: "RefundedByUserId",
                schema: "pdv",
                table: "Payments");
        }
    }
}
