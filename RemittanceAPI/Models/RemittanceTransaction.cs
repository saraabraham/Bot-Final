// Fixed RemittanceTransaction.cs model with proper nullable annotations

using System;
using System.Text.Json.Serialization;

namespace RemittanceAPI.Models
{
    public class Recipient
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public string Name { get; set; } = string.Empty;
        public string? AccountNumber { get; set; }
        public string? BankName { get; set; }
        public string Country { get; set; } = string.Empty;
        public string? PhoneNumber { get; set; }
        public string? Email { get; set; }
    }

    public class RemittanceTransaction
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public string SenderId { get; set; } = string.Empty;
        public Recipient Recipient { get; set; } = new Recipient();
        public decimal Amount { get; set; }
        public string Currency { get; set; } = string.Empty;
        public decimal? ExchangeRate { get; set; }
        public decimal? Fees { get; set; }
        public decimal? TotalAmount { get; set; }

        [JsonConverter(typeof(JsonStringEnumConverter))]
        public TransactionStatus Status { get; set; } = TransactionStatus.Draft;
        public string PaymentMethod { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime? CompletedAt { get; set; }
        public string Reference { get; set; } = Guid.NewGuid().ToString()[..8].ToUpper();
    }

    public enum TransactionStatus
    {
        Draft,
        Pending,
        Processing,
        Completed,
        Failed
    }

    public class ExchangeRateRequest
    {
        public string From { get; set; } = string.Empty;
        public string To { get; set; } = string.Empty;
    }

    public class ExchangeRateResponse
    {
        public decimal Rate { get; set; }
    }

    public class FeeCalculationRequest
    {
        public decimal Amount { get; set; }
        public string Currency { get; set; } = string.Empty;
        public string Method { get; set; } = string.Empty;
    }

    public class FeeCalculationResponse
    {
        public decimal Fees { get; set; }
    }
}