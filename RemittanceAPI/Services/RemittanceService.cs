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
        private readonly AuthService _authService;
        private readonly Dictionary<string, decimal> _exchangeRates;

        public RemittanceService(
            ILogger<RemittanceService> logger,
            RemittanceDbContext dbContext,
            AuthService authService
            )
        {
            _logger = logger;
            _dbContext = dbContext;
            _authService = authService;

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

        //Method to check user balance
        public async Task<UserBalanceResponse> CheckUserBalanceAsync(string userId)
        {
            _logger.LogInformation($"Checking balance for user {userId}");

            var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == userId);
            if (user == null)
            {
                throw new ArgumentException("User not found");
            }

            return new UserBalanceResponse
            {
                Balance = user.Balance,
                Currency = user.PreferredCurrency
            };
        }

        public async Task<bool> AddRecipientToSavedAsync(string userId, string recipientId)
        {
            _logger.LogInformation($"Adding recipient {recipientId} to user {userId}'s saved list");

            try
            {
                // Get the user
                var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == userId);
                if (user == null)
                {
                    throw new ArgumentException($"User with ID {userId} not found");
                }

                // Get the recipient
                var recipient = await _dbContext.Recipients.FirstOrDefaultAsync(r => r.Id == recipientId);
                if (recipient == null)
                {
                    throw new ArgumentException($"Recipient with ID {recipientId} not found");
                }

                // Initialize SavedRecipients if null
                if (user.SavedRecipients == null)
                {
                    user.SavedRecipients = new List<string>();
                }

                // Add recipient if not already in the list
                if (!user.SavedRecipients.Contains(recipientId))
                {
                    user.SavedRecipients.Add(recipientId);
                    _dbContext.Users.Update(user); // Make sure EF knows the user was updated
                    await _dbContext.SaveChangesAsync();
                    return true;
                }

                return false; // Recipient already in list
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error adding recipient {recipientId} to user {userId}'s saved list");
                throw;
            }
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

            var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == transaction.SenderId);
            if (user == null)
            {
                throw new ArgumentException($"User with ID {transaction.SenderId} not found");
            }

            // Calculate fees if needed
            if (transaction.Fees == null)
            {
                var feeResponse = await CalculateFeesAsync(transaction.Amount, transaction.Currency, transaction.PaymentMethod);
                transaction.Fees = feeResponse.Fees;
            }

            // Calculate total amount
            transaction.TotalAmount = transaction.Amount + transaction.Fees;

            // Convert if currencies don't match
            decimal totalInUserCurrency = transaction.TotalAmount ?? 0m;
            if (transaction.Currency != user.PreferredCurrency)
            {
                var rate = await GetExchangeRateAsync(transaction.Currency, user.PreferredCurrency);
                totalInUserCurrency = ((decimal)(transaction.TotalAmount ?? 0m)) * rate.Rate;
            }

            // Check if user has sufficient balance
            if (user.Balance < totalInUserCurrency)
            {
                throw new InvalidOperationException($"Insufficient balance. You have {user.Balance} {user.PreferredCurrency} but need {totalInUserCurrency} {user.PreferredCurrency}");
            }


            // Generate ID if not provided
            if (string.IsNullOrEmpty(transaction.Id))
            {
                transaction.Id = Guid.NewGuid().ToString();
            }

            // Handle recipient first
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

            // Deduct from user's balance
            user.Balance -= totalInUserCurrency;
            _dbContext.Users.Update(user);

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
        // Add method to find recipient by name or create a new one
        public async Task<Recipient> FindOrCreateRecipientAsync(string name, string userId)
        {
            _logger.LogInformation($"Finding or creating recipient with name {name} for user {userId}");

            // Look for an existing recipient with this name
            var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == userId);
            if (user == null)
            {
                throw new ArgumentException($"User with ID {userId} not found");
            }

            // Try to find among user's saved recipients
            if (user.SavedRecipients != null && user.SavedRecipients.Count > 0)
            {
                var recipients = await _dbContext.Recipients
                    .Where(r => user.SavedRecipients.Contains(r.Id))
                    .ToListAsync();

                var existingRecipient = recipients.FirstOrDefault(r =>
                    r.Name.Equals(name, StringComparison.OrdinalIgnoreCase));

                if (existingRecipient != null)
                {
                    _logger.LogInformation($"Found existing recipient: {existingRecipient.Id}");
                    return existingRecipient;
                }
            }

            // Create a new recipient with minimal info - will need to be completed later
            var newRecipient = new Recipient
            {
                Id = Guid.NewGuid().ToString(),
                Name = name,
                Country = "Unknown" // Default value
            };

            await _dbContext.Recipients.AddAsync(newRecipient);

            // Add to user's saved recipients
            if (user.SavedRecipients == null)
            {
                user.SavedRecipients = new List<string>();
            }
            user.SavedRecipients.Add(newRecipient.Id);

            await _dbContext.SaveChangesAsync();
            _logger.LogInformation($"Created new recipient: {newRecipient.Id}");

            return newRecipient;
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
        // Add to RemittanceService.cs

        public async Task<DepositResponse> ProcessDepositAsync(string userId, DepositRequest request)
        {
            _logger.LogInformation($"Processing deposit of {request.Amount} {request.Currency} for user {userId}");

            // Validate deposit data
            if (request.Amount <= 0)
            {
                throw new ArgumentException("Amount must be greater than zero");
            }

            if (string.IsNullOrEmpty(request.Currency))
            {
                throw new ArgumentException("Currency is required");
            }

            if (string.IsNullOrEmpty(request.PaymentMethod))
            {
                throw new ArgumentException("Payment method is required");
            }

            var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == userId);
            if (user == null)
            {
                throw new ArgumentException($"User with ID {userId} not found");
            }

            // Convert if currencies don't match
            decimal amountInUserCurrency = request.Amount;
            if (request.Currency != user.PreferredCurrency)
            {
                var rate = await GetExchangeRateAsync(request.Currency, user.PreferredCurrency);
                amountInUserCurrency = request.Amount * rate.Rate;
            }

            // Process payment (in a real app, this would involve payment gateway integration)
            // Simulate successful payment
            await Task.Delay(1000);

            // Add to user's balance
            user.Balance += amountInUserCurrency;
            _dbContext.Users.Update(user);
            await _dbContext.SaveChangesAsync();

            // Create response
            return new DepositResponse
            {
                Amount = request.Amount,
                Currency = request.Currency,
                PaymentMethod = request.PaymentMethod,
                Status = "Completed",
                Timestamp = DateTime.UtcNow
            };
        }
    }
}