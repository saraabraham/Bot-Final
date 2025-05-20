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

        // Enhanced constructor with better intent patterns
        public ChatbotService(
            ILogger<ChatbotService> logger,
            RemittanceDbContext dbContext,
            RemittanceService remittanceService)
        {
            _logger = logger;
            _dbContext = dbContext;
            _remittanceService = remittanceService;

            // Enhanced intent patterns with better coverage
            _intents = new Dictionary<string, Regex>
            {
                // Greeting patterns
                { "greeting", new Regex(@"\b(hello|hi|hey|greetings|good morning|good afternoon|good evening)\b", RegexOptions.IgnoreCase) },
                
                // Send money patterns (improved to handle various formats)
                { "send_money", new Regex(@"\b(send|transfer|remit|pay)\b.*(?:\$?\d+(?:\.\d{2})?|\d+\s*(?:dollars?|usd|euros?|eur|pounds?|gbp)).*\b(to|for)\b", RegexOptions.IgnoreCase) },
                { "send_money_simple", new Regex(@"\b(send|transfer|remit|pay)\s+(money|funds|cash)\b", RegexOptions.IgnoreCase) },
                
                // Deposit patterns
                { "deposit", new Regex(@"\b(deposit|add\s+money|add\s+funds|load\s+money|put\s+in|top\s+up)\b", RegexOptions.IgnoreCase) },
                
                // Balance check patterns  
                { "check_balance", new Regex(@"\b(balance|how\s+much|available\s+funds|account\s+balance|check\s+balance|show\s+balance|my\s+balance)\b", RegexOptions.IgnoreCase) },
                
                // Exchange rates patterns (IMPROVED)
                { "check_rates", new Regex(@"\b(rate|rates|exchange|conversion|convert|currency\s+rate|exchange\s+rate|currency\s+exchange|check\s+rate)\b", RegexOptions.IgnoreCase) },
                
                // Recipients management patterns (IMPROVED)  
                { "manage_recipients", new Regex(@"\b(recipient|recipients|beneficiary|beneficiaries|receiver|receivers|payee|payees|manage\s+recipient|show\s+recipient|list\s+recipient|my\s+recipient)\b", RegexOptions.IgnoreCase) },
                
                // Transaction status
                { "check_status", new Regex(@"\b(status|track|where).*?(transaction|transfer|money|payment)\b", RegexOptions.IgnoreCase) },
                
                // Help patterns
                { "help", new Regex(@"\b(help|support|how\s+to|guide|explain|what\s+can\s+you\s+do|commands)\b", RegexOptions.IgnoreCase) }
            };
        }

        // Main method for processing text messages
        public async Task<BotCommand> ProcessMessageAsync(string message, string? userId = null)
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

        // Main method for processing voice input
        public async Task<BotCommand> ProcessVoiceAsync(Stream audioStream, string? userId = null)
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

        // Method to get chat history
        public async Task<IEnumerable<ChatMessage>> GetChatHistoryAsync(string userId, int limit = 50)
        {
            if (string.IsNullOrEmpty(userId))
            {
                return new List<ChatMessage>();
            }

            var messages = await _dbContext.ChatMessages
                .Where(m => m.UserId == userId)
                .OrderByDescending(m => m.Timestamp)
                .Take(limit)
                .OrderBy(m => m.Timestamp)
                .ToListAsync();

            return messages;
        }

        // Enhanced intent identification method
        private (string intent, Dictionary<string, object> entities, double confidence) IdentifyIntent(string message)
        {
            string bestIntent = "unknown";
            double bestConfidence = 0;
            var entities = new Dictionary<string, object>();

            // Normalize message for better matching
            string lowerMessage = message.Trim().ToLower();

            // Remove common filler words that might interfere
            string cleanedMessage = Regex.Replace(lowerMessage, @"\b(please|can|could|would|like|want|to|the|a|an|my)\b", " ", RegexOptions.IgnoreCase).Trim();
            cleanedMessage = Regex.Replace(cleanedMessage, @"\s+", " "); // Remove extra spaces

            _logger.LogInformation($"Processing message: '{message}' -> cleaned: '{cleanedMessage}'");

            // Check for specific single-word or phrase commands first
            if (IsExchangeRateQuery(lowerMessage))
            {
                return ProcessExchangeRateQuery(message);
            }

            if (IsRecipientManagementQuery(lowerMessage))
            {
                return ProcessRecipientManagementQuery(message);
            }

            // Check against each intent pattern
            foreach (var pattern in _intents)
            {
                var match = pattern.Value.Match(cleanedMessage);
                if (match.Success)
                {
                    // Calculate confidence based on match quality
                    double confidence = CalculateConfidence(match, cleanedMessage);

                    if (confidence > bestConfidence)
                    {
                        bestIntent = pattern.Key;
                        bestConfidence = confidence;

                        // Extract entities based on the matched intent
                        entities = ExtractEntities(bestIntent, match, message);
                    }
                }
            }

            _logger.LogInformation($"Best intent: {bestIntent} with confidence: {bestConfidence}");
            return (bestIntent, entities, bestConfidence);
        }

        // Helper method to check for exchange rate queries
        private bool IsExchangeRateQuery(string message)
        {
            var exchangePatterns = new[]
            {
                @"\b(exchange\s+rate|currency\s+rate|rate\s+of|conversion\s+rate)\b",
                @"\b(usd\s+to\s+eur|eur\s+to\s+usd|gbp\s+to\s+usd|dollar\s+to\s+euro)\b",
                @"\brate\b.*\b(from|to|between)\b",
                @"\b(check|show|get|what)\b.*\brate\b",
                @"\bexchange\b",
                @"\bconvert\b.*\b(currency|money|dollars|euros|pounds)\b"
            };

            return exchangePatterns.Any(pattern => Regex.IsMatch(message, pattern, RegexOptions.IgnoreCase));
        }

        // Helper method to check for recipient management queries
        private bool IsRecipientManagementQuery(string message)
        {
            var recipientPatterns = new[]
            {
                @"\b(manage\s+recipient|show\s+recipient|list\s+recipient|my\s+recipient)\b",
                @"\b(recipient|recipients|beneficiary|beneficiaries)\b",
                @"\b(saved\s+contact|saved\s+payee|payee)\b",
                @"\b(who\s+can\s+i\s+send|who\s+do\s+i\s+send)\b",
                @"\b(add\s+recipient|new\s+recipient|create\s+recipient)\b"
            };

            return recipientPatterns.Any(pattern => Regex.IsMatch(message, pattern, RegexOptions.IgnoreCase));
        }

        // Process exchange rate queries
        private (string intent, Dictionary<string, object> entities, double confidence) ProcessExchangeRateQuery(string message)
        {
            var entities = new Dictionary<string, object>();

            // Try to extract currencies from the message
            var currencyMatch = Regex.Match(message, @"\b([A-Z]{3})\s+to\s+([A-Z]{3})\b", RegexOptions.IgnoreCase);
            if (!currencyMatch.Success)
            {
                currencyMatch = Regex.Match(message, @"\b(dollar|usd|euro|eur|pound|gbp)\s+to\s+(dollar|usd|euro|eur|pound|gbp)\b", RegexOptions.IgnoreCase);
            }

            if (currencyMatch.Success)
            {
                entities["fromCurrency"] = NormalizeCurrency(currencyMatch.Groups[1].Value);
                entities["toCurrency"] = NormalizeCurrency(currencyMatch.Groups[2].Value);
            }
            else
            {
                // Default currencies if not specified
                entities["fromCurrency"] = "USD";
                entities["toCurrency"] = "EUR";
            }

            return ("check_rates", entities, 0.9);
        }

        // Process recipient management queries
        private (string intent, Dictionary<string, object> entities, double confidence) ProcessRecipientManagementQuery(string message)
        {
            var entities = new Dictionary<string, object>();

            // Check if it's about adding a new recipient
            if (Regex.IsMatch(message, @"\b(add|new|create)\b.*\brecipient\b", RegexOptions.IgnoreCase))
            {
                entities["action"] = "add";
            }
            else
            {
                entities["action"] = "list";
            }

            return ("manage_recipients", entities, 0.9);
        }

        // Helper method to normalize currency names
        private string NormalizeCurrency(string currency)
        {
            var currencyMap = new Dictionary<string, string>
            {
                {"dollar", "USD"}, {"dollars", "USD"}, {"usd", "USD"},
                {"euro", "EUR"}, {"euros", "EUR"}, {"eur", "EUR"},
                {"pound", "GBP"}, {"pounds", "GBP"}, {"gbp", "GBP"},
                {"rupee", "INR"}, {"rupees", "INR"}, {"inr", "INR"}
            };

            return currencyMap.TryGetValue(currency.ToLower(), out var normalizedCurrency) ? normalizedCurrency : currency.ToUpper();
        }

        // Helper method to calculate confidence score
        private double CalculateConfidence(Match match, string message)
        {
            // Base confidence on match length relative to message length
            double confidence = (double)match.Length / message.Length;

            // Boost confidence for exact keyword matches
            if (match.Value.Contains("exchange") || match.Value.Contains("rate"))
                confidence += 0.2;
            if (match.Value.Contains("recipient") || match.Value.Contains("manage"))
                confidence += 0.2;

            // Cap confidence at 1.0
            return Math.Min(confidence, 1.0);
        }

        // Enhanced response generation
        public async Task<string> GenerateResponseAsync(string intent, Dictionary<string, object> entities, string? userId)
        {
            switch (intent)
            {
                case "check_rates":
                    return await HandleExchangeRateRequest(entities);

                case "manage_recipients":
                    return await HandleRecipientManagementRequest(entities, userId);

                case "greeting":
                    return "Hello! I'm your remittance assistant. I can help you:\n" +
                           "• Send money to recipients\n" +
                           "• Check exchange rates\n" +
                           "• Manage your recipients\n" +
                           "• Deposit money\n" +
                           "• Check your balance\n" +
                           "What would you like to do today?";

                case "help":
                    return "I can help you with:\n" +
                           "• **Send money** - Say 'send $100 to John' or 'transfer money'\n" +
                           "• **Check rates** - Say 'exchange rate' or 'USD to EUR rate'\n" +
                           "• **Manage recipients** - Say 'show recipients' or 'manage recipients'\n" +
                           "• **Deposit money** - Say 'deposit $50' or 'add money'\n" +
                           "• **Check balance** - Say 'check balance' or 'my balance'\n" +
                           "• **Transaction status** - Say 'check status' or 'track transfer'\n\n" +
                           "You can also use voice commands by clicking the microphone button!";

                case "send_money":
                case "send_money_simple":
                    return await HandleSendMoneyRequest(entities, userId);

                case "deposit":
                    return await HandleDepositRequest(entities, userId);

                case "check_balance":
                    return await HandleBalanceRequest(userId);

                case "check_status":
                    return await HandleStatusRequest(userId);

                default:
                    return "I'm not sure I understand that command. Try saying:\n" +
                           "• 'Send money' or 'transfer funds'\n" +
                           "• 'Check exchange rates' or 'currency rates'\n" +
                           "• 'Show recipients' or 'manage recipients'\n" +
                           "• 'Deposit money' or 'add funds'\n" +
                           "• 'Check balance'\n" +
                           "• 'Help' for more information";
            }
        }

        // Handle exchange rate requests
        private async Task<string> HandleExchangeRateRequest(Dictionary<string, object> entities)
        {
            try
            {
                string fromCurrency = entities.TryGetValue("fromCurrency", out var from) ? from.ToString() ?? "USD" : "USD";
                string toCurrency = entities.TryGetValue("toCurrency", out var to) ? to.ToString() ?? "EUR" : "EUR";

                var rate = await _remittanceService.GetExchangeRateAsync(fromCurrency, toCurrency);

                return $"💱 **Current Exchange Rate**\n" +
                       $"1 {fromCurrency} = {rate.Rate:F4} {toCurrency}\n\n" +
                       $"Would you like to:\n" +
                       $"• Check other currency rates\n" +
                       $"• Send money using this rate\n" +
                       $"• View detailed exchange information";
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting exchange rate");
                return "I'm having trouble getting current exchange rates. Please try again in a moment, or specify the currencies you'd like to convert (e.g., 'USD to EUR rate').";
            }
        }

        // Handle recipient management requests
        private async Task<string> HandleRecipientManagementRequest(Dictionary<string, object> entities, string? userId)
        {
            try
            {
                if (string.IsNullOrEmpty(userId))
                {
                    return "Please log in to manage your recipients.";
                }

                string action = entities.TryGetValue("action", out var act) ? act.ToString() ?? "list" : "list";

                if (action == "add")
                {
                    return "I can help you add a new recipient! Please provide:\n" +
                           "• Recipient's name\n" +
                           "• Account number\n" +
                           "• Bank name\n" +
                           "• Country\n\n" +
                           "You can start by saying 'Add [Name] as recipient' or go to the send money form to add them during a transaction.";
                }
                else
                {
                    var recipients = await _remittanceService.GetSavedRecipientsAsync(userId);

                    if (!recipients.Any())
                    {
                        return "You don't have any saved recipients yet.\n\n" +
                               "You can add recipients by:\n" +
                               "• Starting a money transfer\n" +
                               "• Saying 'add new recipient'\n" +
                               "• Using the send money form";
                    }

                    var recipientList = string.Join("\n", recipients.Select((r, i) =>
                        $"**{i + 1}. {r.Name}**\n" +
                        $"   📍 {r.Country}\n" +
                        $"   🏦 {r.BankName ?? "Bank not specified"}\n"));

                    return $"👥 **Your Saved Recipients** ({recipients.Count()})\n\n{recipientList}\n\n" +
                           "You can send money to any of these recipients or add a new one!";
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error handling recipient management request");
                return "I'm having trouble accessing your recipients right now. Please try again in a moment.";
            }
        }

        // Handle send money requests
        private async Task<string> HandleSendMoneyRequest(Dictionary<string, object> entities, string? userId)
        {
            if (string.IsNullOrEmpty(userId))
            {
                return "Please log in to send money.";
            }

            if (entities.TryGetValue("amount", out var amountObj) && entities.TryGetValue("recipient", out var recipientObj))
            {
                decimal amount = Convert.ToDecimal(amountObj);
                string recipient = recipientObj.ToString() ?? "";
                string currency = entities.TryGetValue("currency", out var curr) ? curr.ToString() ?? "USD" : "USD";

                return $"I'll help you send {amount:C} {currency} to {recipient}. Let me check if {recipient} is in your saved recipients...";
            }
            else if (entities.TryGetValue("recipient", out var recip))
            {
                string recipient = recip.ToString() ?? "";
                return $"I'll help you send money to {recipient}. How much would you like to send?";
            }
            else if (entities.TryGetValue("amount", out var amt))
            {
                decimal amount = Convert.ToDecimal(amt);
                string currency = entities.TryGetValue("currency", out var curr) ? curr.ToString() ?? "USD" : "USD";
                return $"I'll help you send {amount:C} {currency}. Who would you like to send it to?";
            }
            else
            {
                return "I'll help you send money. Who would you like to send money to and how much?";
            }
        }

        // Handle deposit requests
        private async Task<string> HandleDepositRequest(Dictionary<string, object> entities, string? userId)
        {
            if (string.IsNullOrEmpty(userId))
            {
                return "Please log in to make a deposit.";
            }

            if (entities.TryGetValue("amount", out var amountObj))
            {
                decimal amount = Convert.ToDecimal(amountObj);
                string currency = entities.TryGetValue("currency", out var curr) ? curr.ToString() ?? "USD" : "USD";
                return $"I'll help you deposit {amount:C} {currency} to your account. What payment method would you like to use?";
            }
            else
            {
                return "I'll help you deposit money. How much would you like to deposit?";
            }
        }

        // Handle balance requests
        private async Task<string> HandleBalanceRequest(string? userId)
        {
            if (string.IsNullOrEmpty(userId))
            {
                return "Please log in to check your balance.";
            }

            try
            {
                var balance = await _remittanceService.CheckUserBalanceAsync(userId);
                return $"💰 Your current balance is {balance.Balance:C} {balance.Currency}";
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error checking balance");
                return "I'm having trouble retrieving your balance. Please try again later.";
            }
        }

        // Handle status requests
        private async Task<string> HandleStatusRequest(string? userId)
        {
            if (string.IsNullOrEmpty(userId))
            {
                return "Please log in to check transaction status.";
            }

            try
            {
                var transactions = await _remittanceService.GetTransactionHistoryAsync(userId);
                var recentTransactions = transactions.Take(3).ToList();

                if (!recentTransactions.Any())
                {
                    return "You don't have any recent transactions.";
                }

                var statusList = string.Join("\n", recentTransactions.Select(t =>
                    $"• {t.Reference}: {t.Amount:C} {t.Currency} to {t.Recipient?.Name} - {t.Status}"));

                return $"📊 **Recent Transactions**\n\n{statusList}\n\nWould you like details on any specific transaction?";
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error checking transaction status");
                return "I'm having trouble retrieving your transaction history. Please try again later.";
            }
        }

        // Entity extraction method
        private Dictionary<string, object> ExtractEntities(string intent, Match match, string message)
        {
            var entities = new Dictionary<string, object>();

            switch (intent)
            {
                case "send_money":
                case "send_money_simple":
                    ExtractSendMoneyEntities(entities, message);
                    break;

                case "deposit":
                    ExtractDepositEntities(entities, message);
                    break;

                case "check_rates":
                    ExtractExchangeRateEntities(entities, message);
                    break;

                case "manage_recipients":
                    ExtractRecipientEntities(entities, message);
                    break;

                case "check_balance":
                    // Balance check doesn't need entity extraction
                    break;

                case "help":
                    // Help doesn't need entity extraction
                    break;

                default:
                    // For unknown intents, try to extract any recognizable entities
                    ExtractGeneralEntities(entities, message);
                    break;
            }

            return entities;
        }

        // Helper method to extract send money entities
        private void ExtractSendMoneyEntities(Dictionary<string, object> entities, string message)
        {
            // Extract amount with various patterns
            var amountMatches = new[]
            {
                Regex.Match(message, @"\$\s*([0-9,]+(?:\.[0-9]{1,2})?)", RegexOptions.IgnoreCase),
                Regex.Match(message, @"([0-9,]+(?:\.[0-9]{1,2})?)\s*(?:dollars?|usd)", RegexOptions.IgnoreCase),
                Regex.Match(message, @"([0-9,]+(?:\.[0-9]{1,2})?)\s*(?:euros?|eur)", RegexOptions.IgnoreCase),
                Regex.Match(message, @"([0-9,]+(?:\.[0-9]{1,2})?)\s*(?:pounds?|gbp)", RegexOptions.IgnoreCase)
            };

            foreach (var amountMatch in amountMatches)
            {
                if (amountMatch.Success)
                {
                    if (decimal.TryParse(amountMatch.Groups[1].Value.Replace(",", ""), out decimal amount))
                    {
                        entities["amount"] = amount;
                        break;
                    }
                }
            }

            // Extract recipient name
            var recipientPatterns = new[]
            {
                @"(?:to|for)\s+([a-zA-Z][a-zA-Z\s]*?)(?:\s|$|\.)",
                @"(?:send|transfer|pay)\s+.*?\s+(?:to|for)\s+([a-zA-Z][a-zA-Z\s]*?)(?:\s|$|\.)"
            };

            foreach (var pattern in recipientPatterns)
            {
                var recipientMatch = Regex.Match(message, pattern, RegexOptions.IgnoreCase);
                if (recipientMatch.Success)
                {
                    entities["recipient"] = recipientMatch.Groups[1].Value.Trim();
                    break;
                }
            }

            // Extract currency
            ExtractCurrency(entities, message);
        }

        // Helper method to extract deposit entities
        private void ExtractDepositEntities(Dictionary<string, object> entities, string message)
        {
            // Extract amount
            var amountMatch = Regex.Match(message, @"(?:deposit|add|load|put|top up)\s+\$?\s*([0-9,]+(?:\.[0-9]{1,2})?)", RegexOptions.IgnoreCase);
            if (amountMatch.Success)
            {
                if (decimal.TryParse(amountMatch.Groups[1].Value.Replace(",", ""), out decimal amount))
                {
                    entities["amount"] = amount;
                }
            }

            // Extract currency
            ExtractCurrency(entities, message);

            // Extract payment method
            ExtractPaymentMethod(entities, message);
        }

        // Helper method to extract exchange rate entities
        private void ExtractExchangeRateEntities(Dictionary<string, object> entities, string message)
        {
            // Extract currency pairs (e.g., "USD to EUR")
            var currencyPairMatch = Regex.Match(message, @"\b([A-Z]{3})\s+(?:to|and|vs)\s+([A-Z]{3})\b", RegexOptions.IgnoreCase);
            if (currencyPairMatch.Success)
            {
                entities["fromCurrency"] = currencyPairMatch.Groups[1].Value.ToUpper();
                entities["toCurrency"] = currencyPairMatch.Groups[2].Value.ToUpper();
                return;
            }

            // Extract currency names (e.g., "dollar to euro")
            var currencyNameMatch = Regex.Match(message, @"\b(dollar|euro|pound|rupee)s?\s+(?:to|and|vs)\s+(dollar|euro|pound|rupee)s?\b", RegexOptions.IgnoreCase);
            if (currencyNameMatch.Success)
            {
                entities["fromCurrency"] = NormalizeCurrency(currencyNameMatch.Groups[1].Value);
                entities["toCurrency"] = NormalizeCurrency(currencyNameMatch.Groups[2].Value);
                return;
            }

            // Default currencies if not specified
            entities["fromCurrency"] = "USD";
            entities["toCurrency"] = "EUR";
        }

        // Helper method to extract recipient management entities
        private void ExtractRecipientEntities(Dictionary<string, object> entities, string message)
        {
            // Check for action type
            if (Regex.IsMatch(message, @"\b(add|new|create)\b.*\brecipient\b", RegexOptions.IgnoreCase))
            {
                entities["action"] = "add";

                // Try to extract recipient name if provided
                var nameMatch = Regex.Match(message, @"(?:add|new|create)\s+([a-zA-Z][a-zA-Z\s]*?)\s+(?:as\s+)?recipient", RegexOptions.IgnoreCase);
                if (nameMatch.Success)
                {
                    entities["recipientName"] = nameMatch.Groups[1].Value.Trim();
                }
            }
            else if (Regex.IsMatch(message, @"\b(show|list|view|display)\b.*\brecipient\b", RegexOptions.IgnoreCase))
            {
                entities["action"] = "list";
            }
            else if (Regex.IsMatch(message, @"\b(manage|edit|update)\b.*\brecipient\b", RegexOptions.IgnoreCase))
            {
                entities["action"] = "manage";
            }
            else
            {
                entities["action"] = "list"; // Default action
            }
        }

        // Helper method to extract general entities from any message
        private void ExtractGeneralEntities(Dictionary<string, object> entities, string message)
        {
            // Try to extract amount from any context
            var amountMatch = Regex.Match(message, @"\$\s*([0-9,]+(?:\.[0-9]{1,2})?)|([0-9,]+(?:\.[0-9]{1,2})?)\s*(?:dollars?|euros?|pounds?)", RegexOptions.IgnoreCase);
            if (amountMatch.Success)
            {
                string amountStr = amountMatch.Groups[1].Success ? amountMatch.Groups[1].Value : amountMatch.Groups[2].Value;
                if (decimal.TryParse(amountStr.Replace(",", ""), out decimal amount))
                {
                    entities["amount"] = amount;
                }
            }

            // Try to extract any name that might be a recipient
            var nameMatch = Regex.Match(message, @"(?:to|for)\s+([a-zA-Z][a-zA-Z\s]{1,20}?)(?:\s|$)", RegexOptions.IgnoreCase);
            if (nameMatch.Success)
            {
                entities["possibleRecipient"] = nameMatch.Groups[1].Value.Trim();
            }

            // Extract currency if present
            ExtractCurrency(entities, message);
        }

        // Helper method to extract currency from message
        private void ExtractCurrency(Dictionary<string, object> entities, string message)
        {
            var currencyPatterns = new Dictionary<string, string>
            {
                { @"\b(dollars?|usd)\b", "USD" },
                { @"\b(euros?|eur)\b", "EUR" },
                { @"\b(pounds?|gbp|sterling)\b", "GBP" },
                { @"\b(rupees?|inr)\b", "INR" },
                { @"\b(yen|jpy)\b", "JPY" },
                { @"\$", "USD" },
                { @"€", "EUR" },
                { @"£", "GBP" },
                { @"₹", "INR" }
            };

            foreach (var pattern in currencyPatterns)
            {
                if (Regex.IsMatch(message, pattern.Key, RegexOptions.IgnoreCase))
                {
                    entities["currency"] = pattern.Value;
                    break;
                }
            }

            // Default to USD if no currency found
            if (!entities.ContainsKey("currency"))
            {
                entities["currency"] = "USD";
            }
        }

        // Helper method to extract payment method from message
        private void ExtractPaymentMethod(Dictionary<string, object> entities, string message)
        {
            var paymentMethods = new Dictionary<string, string>
            {
                { @"\b(card|credit|debit)\b", "card" },
                { @"\b(bank|transfer|wire)\b", "bank" },
                { @"\b(wallet|paypal|digital)\b", "wallet" }
            };

            foreach (var method in paymentMethods)
            {
                if (Regex.IsMatch(message, method.Key, RegexOptions.IgnoreCase))
                {
                    entities["paymentMethod"] = method.Value;
                    break;
                }
            }

            // Default to bank if no method specified
            if (!entities.ContainsKey("paymentMethod"))
            {
                entities["paymentMethod"] = "bank";
            }
        }

        // Message saving methods
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
    }
}