using System;

namespace RemittanceAPI.Models
{
    public class ChatMessage
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public string Text { get; set; }
        public string Sender { get; set; } // "user" or "bot"
        public DateTime Timestamp { get; set; } = DateTime.UtcNow;
        public string? UserId { get; set; } // Optional, for tracking conversation history
    }

    public class UserMessage
    {
        public string Text { get; set; }
    }

    public class BotCommand
    {
        public string Intent { get; set; }
        public Dictionary<string, object> Entities { get; set; } = new Dictionary<string, object>();
        public double Confidence { get; set; }
        public string? Text { get; set; } // For voice transcription
    }
}