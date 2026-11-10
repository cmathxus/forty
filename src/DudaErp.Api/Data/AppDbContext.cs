using DudaErp.Api.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.DataProtection.EntityFrameworkCore;

namespace DudaErp.Api.Data;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options), IDataProtectionKeyContext
{
    public DbSet<DataProtectionKey> DataProtectionKeys => Set<DataProtectionKey>();
    public DbSet<AuthSession> AuthSessions => Set<AuthSession>();
    public DbSet<AppUser> Users => Set<AppUser>();
    public DbSet<StockMovement> StockMovements => Set<StockMovement>();
    public DbSet<ProductionPlan> ProductionPlans => Set<ProductionPlan>();
    public DbSet<ProductionPlanItem> ProductionPlanItems => Set<ProductionPlanItem>();
    public DbSet<DeliveryItemResult> DeliveryItemResults => Set<DeliveryItemResult>();
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
        modelBuilder.Entity<AuthSession>().HasOne<AppUser>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<AuthSession>().HasIndex(x => x.ExpiresAt);
        modelBuilder.Entity<ProductionPlan>().HasIndex(x => x.Number).IsUnique();
        modelBuilder.Entity<ProductionPlan>().HasIndex(x => x.RequestId).IsUnique();
        modelBuilder.Entity<ProductionPlan>().Property(x => x.Notes).HasMaxLength(1000);
        modelBuilder.Entity<ProductionPlanItem>().Property(x => x.PlannedQuantity).HasPrecision(18, 3);
        modelBuilder.Entity<ProductionPlanItem>().Property(x => x.ProducedQuantity).HasPrecision(18, 3);
        modelBuilder.Entity<ProductionPlanItem>().HasIndex(x => new { x.ProductionPlanId, x.ProductId }).IsUnique();
        modelBuilder.Entity<ProductionPlanItem>().HasOne(x => x.Product).WithMany().HasForeignKey(x => x.ProductId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<StockMovement>().Property(x => x.Quantity).HasPrecision(18, 3);
        modelBuilder.Entity<StockMovement>().Property(x => x.SourceKey).HasMaxLength(120);
        modelBuilder.Entity<StockMovement>().Property(x => x.Unit).HasMaxLength(10);
        modelBuilder.Entity<StockMovement>().Property(x => x.Reason).HasMaxLength(500);
        modelBuilder.Entity<StockMovement>().HasIndex(x => x.SourceKey).IsUnique();
        modelBuilder.Entity<StockMovement>().HasIndex(x => new { x.ProductId, x.CreatedAt });
        modelBuilder.Entity<StockMovement>().HasOne(x => x.Product).WithMany().HasForeignKey(x => x.ProductId).OnDelete(DeleteBehavior.Restrict);
        modelBuilder.Entity<DeliveryItemResult>().Property(x => x.DeliveredQuantity).HasPrecision(18, 3);
        modelBuilder.Entity<DeliveryItemResult>().Property(x => x.ReturnedQuantity).HasPrecision(18, 3);
        modelBuilder.Entity<DeliveryItemResult>().Property(x => x.MissingQuantity).HasPrecision(18, 3);
        modelBuilder.Entity<DeliveryItemResult>().HasIndex(x => new { x.DeliveryLoadOrderId, x.OrderItemId }).IsUnique();
        modelBuilder.Entity<DeliveryItemResult>().HasOne(x => x.OrderItem).WithMany().HasForeignKey(x => x.OrderItemId).OnDelete(DeleteBehavior.Restrict);
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
