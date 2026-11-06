using DudaErp.Api.Data;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace DudaErp.Api.Tests;

// O banco informado nunca recebe dados de teste nas tabelas da aplicação.
internal sealed class PostgresTestDatabase : IAsyncDisposable
{
    private readonly string connection;
    private readonly string schema = $"forty_test_{Guid.NewGuid():N}";
    public AppDbContext Db { get; private set; } = null!;
    public DbContextOptions<AppDbContext> Options { get; private set; } = null!;
    private PostgresTestDatabase(string connection) => this.connection = connection;

    public static async Task<PostgresTestDatabase> CreateAsync()
    {
        var test = new PostgresTestDatabase(Environment.GetEnvironmentVariable("FORTY_TEST_CONNECTION")!);
        await using var conn = new NpgsqlConnection(test.connection);
        await conn.OpenAsync();
        await using var create = new NpgsqlCommand($"CREATE SCHEMA \"{test.schema}\"", conn);
        await create.ExecuteNonQueryAsync();
        var settings = new NpgsqlConnectionStringBuilder(test.connection) { SearchPath = test.schema, Pooling = false };
        test.Options = new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(settings.ConnectionString,
            pg => pg.MigrationsHistoryTable("__EFMigrationsHistory", test.schema)).Options;
        test.Db = new AppDbContext(test.Options);
        try { await test.Db.Database.MigrateAsync(); return test; }
        catch { await test.DisposeAsync(); throw; }
    }

    public async ValueTask DisposeAsync()
    {
        if (Db is not null) await Db.DisposeAsync();
        // Identificador criado exclusivamente aqui; não usa um schema vindo da configuração.
        if (!schema.StartsWith("forty_test_") || schema.Length != 43) throw new InvalidOperationException("Schema de teste inválido.");
        await using var conn = new NpgsqlConnection(connection);
        await conn.OpenAsync();
        await using var drop = new NpgsqlCommand($"DROP SCHEMA \"{schema}\" CASCADE", conn);
        await drop.ExecuteNonQueryAsync();
    }
}
