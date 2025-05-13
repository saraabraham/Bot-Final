// Update the ChatbotService.cs

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using RemittanceAPI.Data;
using RemittanceAPI.Models;

namespace RemittanceAPI.Services
{
    public class ChatbotService
    {
        private readonly ILogger<ChatbotService> _logger;
        private readonly RemittanceDbContext _dbContext;
        private readonly RemittanceService _remittanceService;
        private readonly Dictionary<string, Regex> _intents;

        public ChatbotService(
            ILogger<ChatbotService> logger,
            RemittanceDbContext dbContext,
            RemittanceService remittanceService) // Inject RemittanceService
        {
            _logger = logger;
            _dbContext = dbContext;
            _remittanceService = remittanceService;

            // Enhanced intent patterns including deposit and money transfer detection
            _intents = new Dictionary<string, Regex>
            {
                { "greeting", new Regex(@"(hello|hi|hey|greetings)", RegexOptions.IgnoreCase) },
                { "send_money", new Regex(@"(?:send|transfer|remit)\s+(?:(?:\$?\s*)?(\[\d,.\]+))?\s*(?:dollars|euro|pound|usd|eur|gbp)?\s+(?:to\s+)(\w+)", RegexOptions.IgnoreCase) },
                { "deposit", new Regex(@"(deposit|add\s+money|add\s+funds|load\s+money|put\s+in|top\s+up)\s+(?:(?:\$?\s*)?(\[\d,.\]+))?\s*(?:dollars|euro|pound|usd|eur|gbp)?", RegexOptions.IgnoreCase) },
                { "check_balance", new Regex(@"(balance|how\s+much|available\s+funds|account\s+balance)", RegexOptions.IgnoreCase) },
                { "check_rates", new Regex(@"(rate|exchange|conversion|convert)\s*(\w{3})?\s*(to|and)\s*(\w{3})?", RegexOptions.IgnoreCase) },
                { "get_recipients", new Regex(@"(recipient|beneficiary|receiver|payee)s?", RegexOptions.IgnoreCase) },
                { "check_status", new Regex(@"(status|track|where).*?(transaction|transfer|money)", RegexOptions.IgnoreCase) },
                { "help", new Regex(@"(help|support|how to|guide|explain)", RegexOptions.IgnoreCase) }
            };
        }

        public async Task<BotCommand> ProcessMessageAsync(string message, string userId = null)
        {
            _logger.LogInformation($"Processing message: {message}");

            // Save user message if userId is provided
            if (!string.IsNullOrEmpty(userId))
            {
                await SaveUserMessageAsync(userId, message);
            }

            // Detect intent and extract entities
            var (intent, entities, confidence) = IdentifyIntent(message);

            // Log the identified intent
            _logger.LogInformation($"Identified intent: {intent} with confidence: {confidence}");

            // Enhanced handling of intents
            var response = await GenerateResponseAsync(intent, entities, userId);

            // Save bot response
            if (!string.IsNullOrEmpty(userId))
            {
                await SaveBotMessageAsync(userId, response);
            }

            return new BotCommand
            {
                Intent = intent,
                Entities = entities,
                Confidence = confidence,
                Text = response
            };
        }

        public async Task<BotCommand> ProcessVoiceAsync(Stream audioStream, string userId = null)
        {
            _logger.LogInformation("Processing voice input");

            // In a real implementation, this would use a Speech-to-Text service
            // For this example, we'll simulate a basic response

            // Simulated transcription (in real app, we'd send to Google/Azure/AWS STT)
            string transcription = "send 500 dollars to John";

            // Save user message if userId is provided
            if (!string.IsNullOrEmpty(userId))
            {
                await SaveUserMessageAsync(userId, $"🎤 {transcription}");
            }

            // Process the transcribed text
            var (intent, entities, confidence) = IdentifyIntent(transcription);

            // Generate response with enhanced functionality
            var response = await GenerateResponseAsync(intent, entities, userId);

            // Save bot response
            if (!string.IsNullOrEmpty(userId))
            {
                await SaveBotMessageAsync(userId, response);
            }

            return new BotCommand
            {
                Intent = intent,
                Entities = entities,
                Confidence = confidence,
                Text = transcription // Include the transcribed text in the response
            };
        }

        private (string intent, Dictionary<string, object> entities, double confidence) IdentifyIntent(string message)
        {
            // Default values
            string bestIntent = "unknown";
            double bestConfidence = 0;
            var entities = new Dictionary<string, object>();

            // Check against each intent pattern
            foreach (var pattern in _intents)
            {
                var match = pattern.Value.Match(message);
                if (match.Success)
                {
                    // Simple confidence calculation - can be improved with ML models
                    double confidence = (double)match.Length / message.Length;

                    if (confidence > bestConfidence)
                    {
                        bestIntent = pattern.Key;
                        bestConfidence = confidence;

                        // Extract entities based on the matched intent
                        entities = ExtractEntities(bestIntent, match, message);
                    }
                }
            }

            return (bestIntent, entities, bestConfidence);
        }

        private Dictionary<string, object> ExtractEntities(string intent, Match match, string message)
        {
            var entities = new Dictionary<string, object>();

            switch (intent)
            {
                case "send_money":
                    // Enhanced send_money pattern extraction
                    var sendMoneyMatch = Regex.Match(message, @"(?:send|transfer|remit)\s+(?:(?:\$?\s*)?(\[\d,.\]+))?\s*(?:dollars|euro|pound|usd|eur|gbp)?\s+(?:to\s+)(\w+)", RegexOptions.IgnoreCase);

                    if (sendMoneyMatch.Success)
                    {
                        // Extract amount
                        if (sendMoneyMatch.Groups.Count > 1 && !string.IsNullOrEmpty(sendMoneyMatch.Groups[1].Value))
                        {
                            string amountStr = sendMoneyMatch.Groups[1].Value.Replace("$", "").Replace(",", "");
                            if (decimal.TryParse(amountStr, out decimal amount))
                            {
                                entities["amount"] = amount;
                            }
                        }

                        // Extract recipient
                        if (sendMoneyMatch.Groups.Count > 2 && !string.IsNullOrEmpty(sendMoneyMatch.Groups[2].Value))
                        {
                            entities["recipient"] = sendMoneyMatch.Groups[2].Value;
                        }
                    }

                    // Try to extract currency
                    var currencyMatch = Regex.Match(message.ToLower(), @"(dollar|usd|euro|eur|pound|gbp)");
                    if (currencyMatch.Success)
                    {
                        string currency = currencyMatch.Groups[1].Value.ToUpper();
                        switch (currency)
                        {
                            case "DOLLAR": entities["currency"] = "USD"; break;
                            case "EURO": entities["currency"] = "EUR"; break;
                            case "POUND": entities["currency"] = "GBP"; break;
                            default: entities["currency"] = currency; break;
                        }
                    }
                    else
                    {
                        // Default to USD if no currency specified
                        entities["currency"] = "USD";
                    }
                    break;

                case "deposit":
                    // Extract amount for deposit
                    var depositMatch = Regex.Match(message, @"(?:deposit|add\s+money|add\s+funds|load|put\s+in|top\s+up)\s+(?:(?:\$?\s*)?(\[\d,.\]+))?\s*(?:dollars|euro|pound|usd|eur|gbp)?", RegexOptions.IgnoreCase);

                    if (depositMatch.Success && depositMatch.Groups.Count > 1 && !string.IsNullOrEmpty(depositMatch.Groups[1].Value))
                    {
                        string amountStr = depositMatch.Groups[1].Value.Replace("$", "").Replace(",", "");
                        if (decimal.TryParse(amountStr, out decimal amount))
                        {
                            entities["amount"] = amount;
                        }
                    }

                    // Try to extract currency for deposit
                    var depositCurrencyMatch = Regex.Match(message.ToLower(), @"(dollar|usd|euro|eur|pound|gbp)");
                    if (depositCurrencyMatch.Success)
                    {
                        string currency = depositCurrencyMatch.Groups[1].Value.ToUpper();
                        switch (currency)
                        {
                            case "DOLLAR": entities["currency"] = "USD"; break;
                            case "EURO": entities["currency"] = "EUR"; break;
                            case "POUND": entities["currency"] = "GBP"; break;
                            default: entities["currency"] = currency; break;
                        }
                    }
                    else
                    {
                        // Default to USD if no currency specified
                        entities["currency"] = "USD";
                    }

                    // Try to extract payment method
                    var methodMatch = Regex.Match(message.ToLower(), @"(card|bank|wallet|credit\s+card|debit\s+card)");
                    if (methodMatch.Success)
                    {
                        string method = methodMatch.Groups[1].Value.ToLower();
                        switch (method)
                        {
                            case "credit card":
                            case "debit card": entities["paymentMethod"] = "card"; break;
                            default: entities["paymentMethod"] = method; break;
                        }
                    }
                    break;

                case "check_rates":
                    // Try to extract currencies
                    var currenciesMatch = Regex.Match(message.ToUpper(), @"(\w{3})?\s*(TO|AND)\s*(\w{3})?");
                    if (currenciesMatch.Success)
                    {
                        if (!string.IsNullOrEmpty(currenciesMatch.Groups[1].Value))
                        {
                            entities["fromCurrency"] = currenciesMatch.Groups[1].Value;
                        }

                        if (!string.IsNullOrEmpty(currenciesMatch.Groups[3].Value))
                        {
                            entities["toCurrency"] = currenciesMatch.Groups[3].Value;
                        }
                    }
                    break;
            }

            return entities;
        }

        // Updated to async to support balance checking and recipient validation
        public async Task<string> GenerateResponseAsync(string intent, Dictionary<string, object> entities, string userId)
        {
            // Generate appropriate response based on intent and entities
            switch (intent)
            {
                case "greeting":
                    return "Hello! How can I help you with your money transfer today?";

                case "deposit":
                    if (string.IsNullOrEmpty(userId))
                    {
                        string amount = entities.TryGetValue("amount", out var amtVal)
                            ? amtVal.ToString()
                            : "some money";

                        string currency = entities.TryGetValue("currency", out var currVal)
                            ? currVal.ToString()
                            : "USD";

                        return $"I'd like to help you deposit {amount} {currency} into your account. Please log in to continue.";
                    }

                    // Enhanced response for deposit
                    try
                    {
                        // Check if we have amount
                        if (!entities.TryGetValue("amount", out var amtVal))
                        {
                            return "I need to know how much you'd like to deposit. " +
                                   "Please say something like 'deposit 100 dollars'.";
                        }

                        decimal amount = decimal.Parse(amtVal.ToString());
                        string currency = entities.TryGetValue("currency", out var currVal)
                            ? currVal.ToString()
                            : "USD";

                        string paymentMethod = entities.TryGetValue("paymentMethod", out var methodVal)
                            ? methodVal.ToString()
                            : "card";

                        return $"I can help you deposit {amount} {currency} using {paymentMethod}. " +
                               "Would you like to proceed with this deposit?";
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Error processing deposit command");
                        return "I'm having trouble processing your deposit request. Please try again later.";
                    }

                case "send_money":
                    if (string.IsNullOrEmpty(userId))
                    {
                        string amount = entities.TryGetValue("amount", out var amtVal)
                            ? amtVal.ToString()
                            : "some money";

                        string currency = entities.TryGetValue("currency", out var currVal)
                            ? currVal.ToString()
                            : "USD";

                        string recipient = entities.TryGetValue("recipient", out var recVal)
                            ? recVal.ToString()
                            : "someone";

                        return $"I'll help you send {amount} {currency} to {recipient}. Please log in to continue.";
                    }

                    // Enhanced response with balance check and recipient validation
                    try
                    {
                        // Check if we have amount and recipient
                        if (!entities.TryGetValue("amount", out var amtVal) || !entities.TryGetValue("recipient", out var recVal))
                        {
                            return "I need to know how much you want to send and to whom. " +
                                   "Please say something like 'send 100 dollars to John'.";
                        }

                        decimal amount = decimal.Parse(amtVal.ToString());
                        string recipientName = recVal.ToString();
                        string currency = entities.TryGetValue("currency", out var currVal)
                            ? currVal.ToString()
                            : "USD";

                        // Check user balance
                        var balanceResponse = await _remittanceService.CheckUserBalanceAsync(userId);

                        // Simple currency conversion for check
                        decimal amountInUserCurrency = amount;
                        if (currency != balanceResponse.Currency)
                        {
                            var rate = await _remittanceService.GetExchangeRateAsync(currency, balanceResponse.Currency);
                            amountInUserCurrency = amount * rate.Rate;
                        }

                        // Add fees (approximately)
                        var fees = await _remittanceService.CalculateFeesAsync(amount, currency, "bank");
                        decimal totalWithFees = amount + fees.Fees;
                        decimal totalInUserCurrency = amountInUserCurrency + (fees.Fees * amount / amountInUserCurrency);

                        // Check if sufficient balance
                        if (balanceResponse.Balance < totalInUserCurrency)
                        {
                            return $"I'm sorry, you don't have enough balance to send {amount} {currency}. " +
                                   $"Your current balance is {balanceResponse.Balance} {balanceResponse.Currency}, " +
                                   $"but you need approximately {totalInUserCurrency} {balanceResponse.Currency} (including fees).";
                        }

                        // Check if recipient exists among saved recipients
                        var (recipientExists, existingRecipient) = await CheckRecipientExistsAsync(recipientName, userId);

                        if (!recipientExists)
                        {
                            return $"I'd like to send {amount} {currency} to {recipientName}, but they're not in your saved recipients list. " +
                                   $"This will cost approximately {totalWithFees} {currency} including a fee of {fees.Fees} {currency}. " +
                                   $"Would you like to add {recipientName} as a new recipient?";
                        }
                        else
                        {
                            // Recipient exists, check if their details are complete
                            if (string.IsNullOrEmpty(existingRecipient.AccountNumber) || existingRecipient.Country == "Unknown")
                            {
                                return $"I found {recipientName} in your recipients list, but their details are incomplete. " +
                                       $"I can send {amount} {currency} to them, which will cost approximately {totalWithFees} {currency} including fees. " +
                                       $"Would you like to complete their profile first?";
                            }

                            return $"I can send {amount} {currency} to your saved recipient {recipientName}. " +
                                   $"This will cost approximately {totalWithFees} {currency} including a fee of {fees.Fees} {currency}. " +
                                   $"Your balance after this transaction would be about {balanceResponse.Balance - totalInUserCurrency} {balanceResponse.Currency}. " +
                                   $"Shall I proceed with the transfer?";
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Error processing send money command");
                        return "I'm having trouble processing your request. Please try again later.";
                    }

                case "check_balance":
                    if (string.IsNullOrEmpty(userId))
                    {
                        return "You need to log in to check your balance.";
                    }

                    try
                    {
                        var balance = await _remittanceService.CheckUserBalanceAsync(userId);
                        return $"Your current balance is {balance.Balance} {balance.Currency}.";
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Error checking balance");
                        return "I'm having trouble retrieving your balance. Please try again later.";
                    }

                case "check_rates":
                    string fromCurrency = entities.TryGetValue("fromCurrency", out var fromCurr)
                        ? fromCurr.ToString()
                        : "USD";

                    string toCurrency = entities.TryGetValue("toCurrency", out var toCurr)
                        ? toCurr.ToString()
                        : "EUR";

                    try
                    {
                        var rate = await _remittanceService.GetExchangeRateAsync(fromCurrency, toCurrency);
                        return $"The current exchange rate from {fromCurrency} to {toCurrency} is {rate.Rate}.";
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, $"Error getting exchange rate from {fromCurrency} to {toCurrency}");
                        return "I'm having trouble getting the exchange rate. Please try again later.";
                    }

                case "help":
                    return "I can help you send money, check your balance, deposit funds, look up exchange rates, manage recipients, and track transactions. What would you like to do?";

                default:
                    return "I'm not sure I understand. Could you rephrase or tell me if you want to send money, deposit funds, check rates, or manage recipients?";
            }
        }

        // The rest of the ChatbotService methods remain the same
        public async Task<ChatMessage> SaveUserMessageAsync(string userId, string text)
        {
            var message = new ChatMessage
            {
                Text = text,
                Sender = "user",
                Timestamp = DateTime.UtcNow,
                UserId = userId
            };

            await _dbContext.ChatMessages.AddAsync(message);
            await _dbContext.SaveChangesAsync();

            return message;
        }

        public async Task<ChatMessage> SaveBotMessageAsync(string userId, string text)
        {
            var message = new ChatMessage
            {
                Text = text,
                Sender = "bot",
                Timestamp = DateTime.UtcNow,
                UserId = userId
            };

            await _dbContext.ChatMessages.AddAsync(message);
            await _dbContext.SaveChangesAsync();

            return message;
        }

        public async Task<IEnumerable<ChatMessage>> GetChatHistoryAsync(string userId, int limit = 50)
        {
            return await _dbContext.ChatMessages
                .Where(m => m.UserId == userId)
                .OrderByDescending(m => m.Timestamp)
                .Take(limit)
                .OrderBy(m => m.Timestamp)
                .ToListAsync();
        }

        // Add this method to ChatbotService.cs to check if a recipient exists
        private async Task<(bool exists, Recipient recipient)> CheckRecipientExistsAsync(string recipientName, string userId)
        {
            try
            {
                if (string.IsNullOrEmpty(userId))
                {
                    return (false, null);
                }

                // Get the user's saved recipients
                var user = await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == userId);
                if (user == null || user.SavedRecipients == null || user.SavedRecipients.Count == 0)
                {
                    return (false, null);
                }

                // Get all recipients
                var savedRecipients = await _dbContext.Recipients
                    .Where(r => user.SavedRecipients.Contains(r.Id))
                    .ToListAsync();

                // Look for a match (case-insensitive)
                var matchedRecipient = savedRecipients.FirstOrDefault(r =>
                    r.Name.Equals(recipientName, StringComparison.OrdinalIgnoreCase));

                return matchedRecipient != null ? (true, matchedRecipient) : (false, null);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error checking if recipient {recipientName} exists for user {userId}");
                throw;
            }
        }
    }
}