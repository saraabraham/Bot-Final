using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using RemittanceAPI.Data;
using RemittanceAPI.Models;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace RemittanceAPI.Services
{
    public class RemittanceService
    {
        private readonly ILogger<RemittanceService> _logger;
        private readonly RemittanceDbContext _dbContext;
        private readonly Dictionary<string, decimal> _exchangeRates;

        public RemittanceService(
            ILogger<RemittanceService> logger,
            RemittanceDbContext dbContext)
        {
            _logger = logger;
            _dbContext = dbContext;

            // Mock exchange rates
            _exchangeRates = new Dictionary<string, decimal>
            {
                { "USDEUR", 0.85m },
                { "USDGBP", 0.73m },
                { "EURUSD", 1.18m },
                { "EURGBP", 0.86m },
                { "GBPUSD", 1.37m },
                { "GBPEUR", 1.16m }
            };
        }

        public Task<ExchangeRateResponse> GetExchangeRateAsync(string fromCurrency, string toCurrency)
        {
            _logger.LogInformation($"Getting exchange rate from {fromCurrency} to {toCurrency}");

            string key = $"{fromCurrency}{toCurrency}";

            if (_exchangeRates.TryGetValue(key, out decimal rate))
            {
                return Task.FromResult(new ExchangeRateResponse { Rate = rate });
            }

            // Default rate if not found
            return Task.FromResult(new ExchangeRateResponse { Rate = 1.0m });
        }

        public Task<FeeCalculationResponse> CalculateFeesAsync(decimal amount, string currency, string method)
        {
            _logger.LogInformation($"Calculating fees for {amount} {currency} using {method}");

            // Simple fee calculation logic
            decimal feePercentage = method.ToLower() switch
            {
                "bank" => 0.02m, // 2%
                "card" => 0.03m, // 3%
                "wallet" => 0.01m, // 1%
                _ => 0.025m // 2.5% default
            };

            decimal fee = amount * feePercentage;

            // Minimum fee
            fee = Math.Max(fee, 2.0m);

            return Task.FromResult(new FeeCalculationResponse { Fees = fee });
        }

        public async Task<IEnumerable<Recipient>> GetSavedRecipientsAsync(string userId)
        {
            _logger.LogInformation($"Getting saved recipients for user {userId}");

            var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == userId);
            if (user == null)
            {
                return Enumerable.Empty<Recipient>();
            }

            return await _dbContext.Recipients
                .Where(r => user.SavedRecipients.Contains(r.Id))
                .ToListAsync();
        }

        public async Task<Recipient> SaveRecipientAsync(Recipient recipient)
        {
            _logger.LogInformation($"Saving recipient {recipient.Name}");

            try
            {
                // Check if this is an update to an existing recipient or a new one
                if (!string.IsNullOrEmpty(recipient.Id))
                {
                    _logger.LogInformation($"Checking for existing recipient with ID: {recipient.Id}");
                    // Try to find the recipient with this ID
                    var existingById = await _dbContext.Recipients
                        .FirstOrDefaultAsync(r => r.Id == recipient.Id);

                    if (existingById != null)
                    {
                        _logger.LogInformation($"Updating existing recipient with ID: {recipient.Id}");
                        // Update properties
                        _dbContext.Entry(existingById).CurrentValues.SetValues(recipient);
                        await _dbContext.SaveChangesAsync();
                        return existingById;
                    }
                }

                // If we get here, either the ID was null/empty, or no recipient with that ID was found
                // Check if a recipient with the same name and account number already exists
                var existingRecipient = await _dbContext.Recipients
                    .FirstOrDefaultAsync(r =>
                        r.Name == recipient.Name &&
                        r.AccountNumber == recipient.AccountNumber &&
                        r.Country == recipient.Country);

                if (existingRecipient != null)
                {
                    _logger.LogInformation($"Found existing recipient by name/account: {existingRecipient.Id}");
                    return existingRecipient;
                }

                // Generate a new ID for new recipients
                recipient.Id = Guid.NewGuid().ToString();
                _logger.LogInformation($"Adding new recipient with generated ID: {recipient.Id}");

                // Add as a new recipient
                await _dbContext.Recipients.AddAsync(recipient);
                await _dbContext.SaveChangesAsync();
                return recipient;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error saving recipient {recipient.Name}");
                throw;
            }
        }

        public async Task<RemittanceTransaction> SendMoneyAsync(RemittanceTransaction transaction)
        {
            _logger.LogInformation($"Processing money transfer of {transaction.Amount} {transaction.Currency} to {transaction.Recipient?.Name ?? "unknown"}");

            // Validate transaction data
            if (transaction.Amount <= 0)
            {
                throw new ArgumentException("Amount must be greater than zero");
            }

            if (string.IsNullOrEmpty(transaction.Currency))
            {
                throw new ArgumentException("Currency is required");
            }

            if (string.IsNullOrEmpty(transaction.PaymentMethod))
            {
                throw new ArgumentException("Payment method is required");
            }

            if (transaction.Recipient == null)
            {
                throw new ArgumentException("Recipient information is required");
            }

            // Generate ID if not provided
            if (string.IsNullOrEmpty(transaction.Id))
            {
                transaction.Id = Guid.NewGuid().ToString();
            }

            // Handle recipient first - this is the part that's likely failing
            if (transaction.Recipient != null)
            {
                try
                {
                    // Save the recipient and get a reference to the saved entity
                    var savedRecipient = await SaveRecipientAsync(transaction.Recipient);
                    // Replace the transaction's recipient reference with the saved one
                    transaction.Recipient = savedRecipient;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error saving recipient during transaction");
                    throw;
                }
            }

            // Calculate exchange rate if needed
            if (transaction.ExchangeRate == null)
            {
                var rateResponse = await GetExchangeRateAsync("USD", transaction.Currency);
                transaction.ExchangeRate = rateResponse.Rate;
            }

            // Calculate fees if needed
            if (transaction.Fees == null)
            {
                var feeResponse = await CalculateFeesAsync(transaction.Amount, transaction.Currency, transaction.PaymentMethod);
                transaction.Fees = feeResponse.Fees;
            }

            // Calculate total amount
            transaction.TotalAmount = transaction.Amount + transaction.Fees;

            // Set status to Processing (in a real app, this would involve payment processing)
            transaction.Status = TransactionStatus.Processing;

            try
            {
                // Add to transaction history
                await _dbContext.Transactions.AddAsync(transaction);
                await _dbContext.SaveChangesAsync();

                // Simulate processing delay
                await Task.Delay(2000);

                // Update status to Completed
                transaction.Status = TransactionStatus.Completed;
                transaction.CompletedAt = DateTime.UtcNow;

                await _dbContext.SaveChangesAsync();

                return transaction;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error processing transaction {transaction.Id}");
                throw;
            }
        }

        public async Task<IEnumerable<RemittanceTransaction>> GetTransactionHistoryAsync(string userId)
        {
            _logger.LogInformation($"Getting transaction history for user {userId}");

            return await _dbContext.Transactions
                .Where(t => t.SenderId == userId)
                .OrderByDescending(t => t.CreatedAt)
                .ToListAsync();
        }

        public async Task<RemittanceTransaction> GetTransactionStatusAsync(string transactionId)
        {
            _logger.LogInformation($"Getting status for transaction {transactionId}");

            var transaction = await _dbContext.Transactions
                .FirstOrDefaultAsync(t => t.Id == transactionId);

            if (transaction == null)
            {
                _logger.LogWarning($"Transaction {transactionId} not found");
                return null;
            }

            return transaction;
        }
    }
}