using DudaErp.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace DudaErp.Api.Data;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<AppUser> Users => Set<AppUser>();
    public DbSet<Region> Regions => Set<Region>();
    public DbSet<Seller> Sellers => Set<Seller>();
    public DbSet<Customer> Customers => Set<Customer>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<Order> Orders => Set<Order>();
    public DbSet<OrderItem> OrderItems => Set<OrderItem>();
    public DbSet<Vehicle> Vehicles => Set<Vehicle>();
    public DbSet<DeliveryLoad> DeliveryLoads => Set<DeliveryLoad>();
    public DbSet<DeliveryLoadOrder> DeliveryLoadOrders => Set<DeliveryLoadOrder>();
    public DbSet<AccountPayable> AccountsPayable => Set<AccountPayable>();
    public DbSet<AccountReceivable> AccountsReceivable => Set<AccountReceivable>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<AppUser>().HasIndex(x => x.Email).IsUnique();
        modelBuilder.Entity<AppUser>().Property(x => x.Email).HasMaxLength(254);
        modelBuilder.Entity<AppUser>().Property(x => x.Name).HasMaxLength(150);
        modelBuilder.Entity<Region>().HasIndex(x => x.Name).IsUnique();
        modelBuilder.Entity<Seller>().HasIndex(x => x.Code).IsUnique();
        modelBuilder.Entity<Customer>().HasIndex(x => x.TaxId).IsUnique();
        modelBuilder.Entity<Product>().HasIndex(x => x.Code).IsUnique();
        modelBuilder.Entity<Order>().HasIndex(x => x.Number).IsUnique();
        modelBuilder.Entity<Vehicle>().HasIndex(x => x.Plate).IsUnique();
        modelBuilder.Entity<DeliveryLoad>().HasIndex(x => x.Number).IsUnique();
        modelBuilder.Entity<DeliveryLoadOrder>().HasIndex(x => x.OrderId).IsUnique();
        modelBuilder.Entity<AccountReceivable>().HasIndex(x => x.DueDate);
        modelBuilder.Entity<AccountPayable>().HasIndex(x => x.DueDate);

        modelBuilder.Entity<Seller>().Property(x => x.Email).HasMaxLength(200);
        modelBuilder.Entity<Seller>().Property(x => x.Phone).HasMaxLength(40);
        modelBuilder.Entity<Product>().Property(x => x.SalePrice).HasPrecision(18, 2);
        modelBuilder.Entity<Product>().Property(x => x.UnitSalePrice).HasPrecision(18, 2);
        modelBuilder.Entity<Product>().Property(x => x.WeightInKg).HasPrecision(18, 3);
        modelBuilder.Entity<Product>().Property(x => x.IcmsRate).HasPrecision(5, 2);
        modelBuilder.Entity<Product>().Property(x => x.IpiRate).HasPrecision(5, 2);
        modelBuilder.Entity<Order>().Property(x => x.TotalAmount).HasPrecision(18, 2);
        modelBuilder.Entity<Order>().Property(x => x.TotalWeightInKg).HasPrecision(18, 3);
        modelBuilder.Entity<Order>().Property(x => x.PaymentCondition).HasMaxLength(40);
        modelBuilder.Entity<OrderItem>().Property(x => x.Quantity).HasPrecision(18, 3);
        modelBuilder.Entity<OrderItem>().Property(x => x.UnitPrice).HasPrecision(18, 2);
        modelBuilder.Entity<OrderItem>().Property(x => x.UnitWeightInKg).HasPrecision(18, 3);
        modelBuilder.Entity<OrderItem>().Property(x => x.TotalAmount).HasPrecision(18, 2);
        modelBuilder.Entity<DeliveryLoadOrder>().Property(x => x.AmountReceived).HasPrecision(18, 2);
        modelBuilder.Entity<AccountPayable>().Property(x => x.Amount).HasPrecision(18, 2);
        modelBuilder.Entity<AccountReceivable>().Property(x => x.Amount).HasPrecision(18, 2);

        modelBuilder.Entity<Order>()
            .HasMany(x => x.Items)
            .WithOne(x => x.Order)
            .HasForeignKey(x => x.OrderId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<Customer>()
            .HasOne(x => x.Region)
            .WithMany()
            .HasForeignKey(x => x.RegionId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<Customer>()
            .HasOne(x => x.Seller)
            .WithMany()
            .HasForeignKey(x => x.SellerId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<DeliveryLoad>()
            .HasOne(x => x.Region)
            .WithMany()
            .HasForeignKey(x => x.RegionId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<DeliveryLoad>()
            .HasOne(x => x.Vehicle)
            .WithMany()
            .HasForeignKey(x => x.VehicleId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<DeliveryLoad>()
            .HasMany(x => x.Orders)
            .WithOne(x => x.DeliveryLoad)
            .HasForeignKey(x => x.DeliveryLoadId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<DeliveryLoadOrder>()
            .HasOne(x => x.Order)
            .WithMany()
            .HasForeignKey(x => x.OrderId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<AccountReceivable>()
            .HasOne(x => x.Customer)
            .WithMany()
            .HasForeignKey(x => x.CustomerId)
            .OnDelete(DeleteBehavior.SetNull);
    }
}
