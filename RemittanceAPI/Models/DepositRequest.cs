// Add to Models folder or create a new file

namespace RemittanceAPI.Models
{
    public class DepositRequest
    {
        public decimal Amount { get; set; }
        public string Currency { get; set; }
        public string PaymentMethod { get; set; }
        public CardDetails CardDetails { get; set; }
    }

    public class CardDetails
    {
        public string CardNumber { get; set; }
        public string ExpiryDate { get; set; }
        public string CVV { get; set; }
        public string CardHolderName { get; set; }
    }

    public class DepositResponse
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public decimal Amount { get; set; }
        public string Currency { get; set; }
        public string PaymentMethod { get; set; }
        public string Status { get; set; } = "Completed";
        public DateTime Timestamp { get; set; } = DateTime.UtcNow;
        public string TransactionRef { get; set; } = Guid.NewGuid().ToString()[..8].ToUpper();
    }
}