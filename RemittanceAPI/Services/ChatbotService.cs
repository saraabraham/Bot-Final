// Enhanced ChatbotService.cs with better intent recognition
// Add these improved intent patterns and methods

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
    public partial class ChatbotService
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

            return currencyMap.GetValueOrDefault(currency.ToLower(), currency.ToUpper());
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
        public async Task<string> GenerateResponseAsync(string intent, Dictionary<string, object> entities, string userId)
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
                string fromCurrency = entities.GetValueOrDefault("fromCurrency", "USD").ToString();
                string toCurrency = entities.GetValueOrDefault("toCurrency", "EUR").ToString();

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
        // Helper method to determine if a command is complete
        private isCompleteCommand(transcript: string) : boolean {
  const lowerTranscript = transcript.toLowerCase().trim();

        // Define patterns for complete commands
        const completeCommandPatterns = [
          // Send money commands with amount and recipient
    /send\s+\$?\d+.*to\s+\w+/,
    /transfer\s+\$?\d+.*to\s+\w+/,
    /pay\s+\$?\d+.*to\s+\w+/,
    
    // Deposit commands with amount
    /deposit\s+\$?\d+/,
    /add\s+\$?\d+/,
    
    // Simple complete commands
    /^(check\s+balance|show\s+balance|my\s+balance)$/,
    /^(exchange\s+rate|currency\s+rate|check\s+rate)$/,
    /^(show\s+recipients|manage\s+recipients|my\s+recipients)$/,
    /^(help|what\s+can\s+you\s+do)$/,
    
    // More complex but complete patterns
    /send\s+.*\s+to\s+\w+\s+using\s+\w+/,
    /deposit\s+\$?\d+\s+using\s+\w+/,
  ];
  
  const isComplete = completeCommandPatterns.some(pattern => pattern.test(lowerTranscript));
    console.log(`Command "${transcript}" is ${isComplete? 'complete' : 'incomplete'}`);

return isComplete;
}


        // Handle recipient management requests
        private async Task<string> HandleRecipientManagementRequest(Dictionary<string, object> entities, string userId)
{
    try
    {
        if (string.IsNullOrEmpty(userId))
        {
            return "Please log in to manage your recipients.";
        }

        string action = entities.GetValueOrDefault("action", "list").ToString();

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
    }
}