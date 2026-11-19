using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Npgsql;

namespace Pdv.Api.Data;

/// <summary>
/// Escolhe o banco pela connection string:
/// "Data Source=..." → SQLite (desenvolvimento) | "Host=..." ou "postgresql://..." → PostgreSQL (Supabase).
/// </summary>
public static class DatabaseSetup
{
    /// <summary>Schema próprio: fora do "public", as tabelas não ficam expostas pela API REST automática do Supabase.</summary>
    public const string Schema = "pdv";

    public static bool IsPostgres(string connectionString) =>
        !connectionString.TrimStart().StartsWith("Data Source", StringComparison.OrdinalIgnoreCase);

    public static void Configure(DbContextOptionsBuilder options, string connectionString)
    {
        if (IsPostgres(connectionString))
            options.UseNpgsql(ToNpgsql(connectionString), o =>
            {
                o.MigrationsHistoryTable("__EFMigrationsHistory", Schema);
                o.EnableRetryOnFailure(3);
            });
        else
            options.UseSqlite(connectionString);
    }

    public static async Task InitializeAsync(AppDbContext db, string? adminPin)
    {
        if (db.Database.IsNpgsql()) await db.Database.MigrateAsync();
        else await db.Database.EnsureCreatedAsync();
        await Seed.RunAsync(db, adminPin);
    }

    /// <summary>Aceita a URI que o painel do Supabase mostra (postgresql://usuario:senha@host:porta/banco).</summary>
    public static string ToNpgsql(string connectionString)
    {
        var cs = connectionString.Trim();
        if (!cs.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase) &&
            !cs.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase))
            return cs;

        var uri = new Uri(cs);
        var userInfo = uri.UserInfo.Split(':', 2);
        var builder = new NpgsqlConnectionStringBuilder
        {
            Host = uri.Host,
            Port = uri.IsDefaultPort || uri.Port <= 0 ? 5432 : uri.Port,
            Database = uri.AbsolutePath.Trim('/') is { Length: > 0 } dbName ? Uri.UnescapeDataString(dbName) : "postgres",
            Username = Uri.UnescapeDataString(userInfo[0]),
            Password = userInfo.Length > 1 ? Uri.UnescapeDataString(userInfo[1]) : null,
            SslMode = SslMode.Require,
        };
        return builder.ConnectionString;
    }
}

/// <summary>Usado só pelo "dotnet ef" para gerar migrations do PostgreSQL (não conecta no banco).</summary>
public class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<AppDbContext>
{
    public AppDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<AppDbContext>();
        DatabaseSetup.Configure(options, Environment.GetEnvironmentVariable("ConnectionStrings__Default") is { Length: > 0 } cs && DatabaseSetup.IsPostgres(cs)
            ? cs
            : "Host=localhost;Database=pdv;Username=postgres;Password=postgres");
        return new AppDbContext(options.Options);
    }
}
