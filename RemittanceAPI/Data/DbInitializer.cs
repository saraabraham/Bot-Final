using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using RemittanceAPI.Models;
using System;
using System.Linq;
using System.Threading.Tasks;

namespace RemittanceAPI.Data
{
    public static class DbInitializer
    {
        public static async Task InitializeAsync(IHost host)
        {
            using var scope = host.Services.CreateScope();
            var services = scope.ServiceProvider;
            var logger = services.GetRequiredService<ILogger<Program>>();

            try
            {
                var context = services.GetRequiredService<RemittanceDbContext>();

                // Apply any pending migrations
                await context.Database.MigrateAsync();

                // Seed data if needed
                await SeedDataAsync(context);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "An error occurred while initializing the database.");
                throw;
            }
        }

        private static async Task SeedDataAsync(RemittanceDbContext context)
        {
            // Check if we already have users
            if (await context.Users.AnyAsync())
            {
                return;  // Database has been seeded
            }

            // Add a sample user
            var user = new User
            {
                Id = "user1",
                Name = "John Doe",
                Email = "john@example.com",
                // In a real app, this would be properly hashed
                PasswordHash = "password123",
                Phone = "+1234567890",
                PreferredCurrency = "USD"
            };

            await context.Users.AddAsync(user);

            // Add sample recipients
            var recipients = new[]
            {
                new Recipient
                {
                    Id = "rec1",
                    Name = "John Smith",
                    AccountNumber = "1234567890",
                    BankName = "Global Bank",
                    Country = "United Kingdom",
                    Email = "john.smith@example.com",
                    PhoneNumber = "+44123456789"
                },
                new Recipient
                {
                    Id = "rec2",
                    Name = "Maria Garcia",
                    AccountNumber = "0987654321",
                    BankName = "Euro Bank",
                    Country = "Spain",
                    Email = "maria.garcia@example.com",
                    PhoneNumber = "+34123456789"
                }
            };

            await context.Recipients.AddRangeAsync(recipients);

            // Associate recipients with user
            user.SavedRecipients = recipients.Select(r => r.Id).ToList();

            await context.SaveChangesAsync();
        }
    }
}