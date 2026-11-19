using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using Pdv.Api.Domain;

namespace Pdv.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<OrderItem> OrderItems => Set<OrderItem>();
    public DbSet<Payment> Payments => Set<Payment>();

    protected override void ConfigureConventions(ModelConfigurationBuilder b)
    {
        b.Properties<decimal>().HavePrecision(12, 2);
        // Tudo é gravado em UTC; marca o Kind ao ler para a API serializar com "Z".
        b.Properties<DateTime>().HaveConversion<UtcConverter>();
        // Enums gravados como texto: legível no banco e estável ao reordenar.
        b.Properties<UserRole>().HaveConversion<string>().HaveMaxLength(20);
        b.Properties<OrderStatus>().HaveConversion<string>().HaveMaxLength(20);
        b.Properties<PaymentMethod>().HaveConversion<string>().HaveMaxLength(20);
        b.Properties<PaymentStatus>().HaveConversion<string>().HaveMaxLength(20);
    }

    protected override void OnModelCreating(ModelBuilder b)
    {
        if (Database.IsNpgsql()) b.HasDefaultSchema(DatabaseSetup.Schema);

        b.Entity<User>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(80).IsRequired();
            e.HasIndex(x => x.Name).IsUnique();
        });

        b.Entity<Category>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(60).IsRequired();
            e.Property(x => x.Icon).HasMaxLength(16);
        });

        b.Entity<Product>(e =>
        {
            e.Property(x => x.Name).HasMaxLength(120).IsRequired();
            e.Property(x => x.Description).HasMaxLength(300);
            e.Property(x => x.ImageUrl).HasMaxLength(500);
            e.HasOne(x => x.Category).WithMany(c => c.Products).HasForeignKey(x => x.CategoryId).OnDelete(DeleteBehavior.Restrict);
        });

        b.Entity<Order>(e =>
        {
            e.Property(x => x.Label).HasMaxLength(60);
            e.Property(x => x.Notes).HasMaxLength(300);
            e.HasIndex(x => x.Status);
            e.HasIndex(x => x.ClosedAt);
            e.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
            e.HasMany(x => x.Items).WithOne().HasForeignKey(x => x.OrderId).OnDelete(DeleteBehavior.Cascade);
            e.HasMany(x => x.Payments).WithOne(p => p.Order).HasForeignKey(x => x.OrderId).OnDelete(DeleteBehavior.Cascade);
            e.Ignore(x => x.Subtotal);
            e.Ignore(x => x.Total);
            e.Ignore(x => x.Paid);
            e.Ignore(x => x.Remaining);
        });

        b.Entity<OrderItem>(e =>
        {
            e.Property(x => x.ProductName).HasMaxLength(120);
            e.Property(x => x.Notes).HasMaxLength(200);
            e.HasOne(x => x.Product).WithMany().HasForeignKey(x => x.ProductId).OnDelete(DeleteBehavior.Restrict);
        });

        b.Entity<Payment>(e =>
        {
            e.Property(x => x.ExternalId).HasMaxLength(64);
            e.Property(x => x.RefundReason).HasMaxLength(200);
            e.HasIndex(x => x.ExternalId);
            e.HasIndex(x => x.PaidAt);
        });
    }
}

public class UtcConverter() : ValueConverter<DateTime, DateTime>(
    v => v.Kind == DateTimeKind.Utc ? v : v.ToUniversalTime(),
    v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
