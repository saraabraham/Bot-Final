using System;
using System.Text.Json.Serialization;

namespace RemittanceAPI.Models
{
    public class Recipient
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public string Name { get; set; }
        public string? AccountNumber { get; set; }
        public string? BankName { get; set; }
        public string Country { get; set; }
        public string? PhoneNumber { get; set; }
        public string? Email { get; set; }
    }

    public class RemittanceTransaction
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public string SenderId { get; set; }
        public Recipient Recipient { get; set; }
        public decimal Amount { get; set; }
        public string Currency { get; set; }
        public decimal? ExchangeRate { get; set; }
        public decimal? Fees { get; set; }
        public decimal? TotalAmount { get; set; }

        [JsonConverter(typeof(JsonStringEnumConverter))]
        public TransactionStatus Status { get; set; } = TransactionStatus.Draft;
        public string PaymentMethod { get; set; }
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
        public string From { get; set; }
        public string To { get; set; }
    }

    public class ExchangeRateResponse
    {
        public decimal Rate { get; set; }
    }

    public class FeeCalculationRequest
    {
        public decimal Amount { get; set; }
        public string Currency { get; set; }
        public string Method { get; set; }
    }

    public class FeeCalculationResponse
    {
        public decimal Fees { get; set; }
    }
}