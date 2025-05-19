// Fixed ChatMessage.cs model with proper nullable annotations

using System;
using System.Collections.Generic;

namespace RemittanceAPI.Models
{
    public class ChatMessage
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public string Text { get; set; } = string.Empty;
        public string Sender { get; set; } = string.Empty; // "user" or "bot"
        public DateTime Timestamp { get; set; } = DateTime.UtcNow;
        public string? UserId { get; set; } // Optional, for tracking conversation history
    }

    public class UserMessage
    {
        public string Text { get; set; } = string.Empty;
    }

    public class BotCommand
    {
        public string Intent { get; set; } = string.Empty;
        public Dictionary<string, object> Entities { get; set; } = new Dictionary<string, object>();
        public double Confidence { get; set; }
        public string? Text { get; set; } // For voice transcription
    }
}