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
        private readonly Dictionary<string, Regex> _intents;

        public ChatbotService(
            ILogger<ChatbotService> logger,
            RemittanceDbContext dbContext)
        {
            _logger = logger;
            _dbContext = dbContext;

            // Basic intent patterns
            _intents = new Dictionary<string, Regex>
            {
                { "greeting", new Regex(@"(hello|hi|hey|greetings)", RegexOptions.IgnoreCase) },
                { "send_money", new Regex(@"(send|transfer|remit) (\$?[\d,]+(\.\d+)?)? ?(money|dollars|euro|pound)?( to (\w+))?", RegexOptions.IgnoreCase) },
                { "check_rates", new Regex(@"(rate|exchange|conversion|convert) ?(\w{3})? ?(to|and) ?(\w{3})?", RegexOptions.IgnoreCase) },
                { "get_recipients", new Regex(@"(recipient|beneficiary|receiver|payee)s?", RegexOptions.IgnoreCase) },
                { "check_status", new Regex(@"(status|track|where).*(transaction|transfer|money)", RegexOptions.IgnoreCase) },
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

            // Generate response and save it if userId is provided
            var response = GenerateResponse(new BotCommand { Intent = intent, Entities = entities, Confidence = confidence });

            if (!string.IsNullOrEmpty(userId))
            {
                await SaveBotMessageAsync(userId, response);
            }

            return new BotCommand
            {
                Intent = intent,
                Entities = entities,
                Confidence = confidence
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

            // Now process the transcribed text just like a text message
            var (intent, entities, confidence) = IdentifyIntent(transcription);

            // Generate response and save it if userId is provided
            var response = GenerateResponse(new BotCommand { Intent = intent, Entities = entities, Confidence = confidence });

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
                    // Try to extract amount
                    var amountMatch = Regex.Match(message, @"(\$?[\d,]+(\.\d+)?)");
                    if (amountMatch.Success)
                    {
                        string amountStr = amountMatch.Groups[1].Value.Replace("$", "").Replace(",", "");
                        if (decimal.TryParse(amountStr, out decimal amount))
                        {
                            entities["amount"] = amount;
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

                    // Try to extract recipient name
                    var recipientMatch = Regex.Match(message, @"to (\w+)");
                    if (recipientMatch.Success)
                    {
                        entities["recipient"] = recipientMatch.Groups[1].Value;
                    }
                    break;

                case "check_rates":
                    // Try to extract currencies
                    var currenciesMatch = Regex.Match(message.ToUpper(), @"(\w{3})? ?(TO|AND) ?(\w{3})?");
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

        public string GenerateResponse(BotCommand command)
        {
            // Generate appropriate response based on intent and entities
            switch (command.Intent)
            {
                case "greeting":
                    return "Hello! How can I help you with your money transfer today?";

                case "send_money":
                    string amount = command.Entities.TryGetValue("amount", out var amtVal)
                        ? amtVal.ToString()
                        : "some money";

                    string currency = command.Entities.TryGetValue("currency", out var currVal)
                        ? currVal.ToString()
                        : "USD";

                    string recipient = command.Entities.TryGetValue("recipient", out var recVal)
                        ? recVal.ToString()
                        : "someone";

                    return $"I'll help you send {amount} {currency} to {recipient}. Would you like to proceed?";

                case "check_rates":
                    string fromCurrency = command.Entities.TryGetValue("fromCurrency", out var fromCurr)
                        ? fromCurr.ToString()
                        : "USD";

                    string toCurrency = command.Entities.TryGetValue("toCurrency", out var toCurr)
                        ? toCurr.ToString()
                        : "EUR";

                    // In a real app, we would fetch the actual rate
                    return $"Let me check the current exchange rate from {fromCurrency} to {toCurrency} for you.";

                case "help":
                    return "I can help you send money, check exchange rates, manage recipients, and track transactions. What would you like to do?";

                default:
                    return "I'm not sure I understand. Could you rephrase or tell me if you want to send money, check rates, or manage recipients?";
            }
        }

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
    }
}