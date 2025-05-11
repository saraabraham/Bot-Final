using Microsoft.EntityFrameworkCore;
using RemittanceAPI.Models;

namespace RemittanceAPI.Data
{
    public class RemittanceDbContext : DbContext
    {
        public RemittanceDbContext(DbContextOptions<RemittanceDbContext> options)
            : base(options)
        {
        }

        public DbSet<User> Users { get; set; }
        public DbSet<Recipient> Recipients { get; set; }
        public DbSet<RemittanceTransaction> Transactions { get; set; }
        public DbSet<ChatMessage> ChatMessages { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // Configure User entity
            modelBuilder.Entity<User>()
                .HasKey(u => u.Id);

            modelBuilder.Entity<User>()
                .Property(u => u.Email)
                .IsRequired();

            // Configure Recipient entity
            modelBuilder.Entity<Recipient>()
                .HasKey(r => r.Id);

            modelBuilder.Entity<Recipient>()
                .Property(r => r.Name)
                .IsRequired();

            // Configure Transaction entity
            modelBuilder.Entity<RemittanceTransaction>()
                .HasKey(t => t.Id);

            modelBuilder.Entity<RemittanceTransaction>()
                .Property(t => t.Amount)
                .HasColumnType("decimal(18,2)");

            modelBuilder.Entity<RemittanceTransaction>()
                .Property(t => t.Fees)
                .HasColumnType("decimal(18,2)");

            modelBuilder.Entity<RemittanceTransaction>()
                .Property(t => t.TotalAmount)
                .HasColumnType("decimal(18,2)");

            modelBuilder.Entity<RemittanceTransaction>()
                .Property(t => t.ExchangeRate)
                .HasColumnType("decimal(18,6)");

            // Configure ChatMessage entity
            modelBuilder.Entity<ChatMessage>()
                .HasKey(m => m.Id);
        }
    }
}