// Fixed DepositRequest.cs with proper namespace imports

using System;
using System.ComponentModel.DataAnnotations; // Add this import for validation attributes

namespace RemittanceAPI.Models
{
    public class DepositRequest
    {
        [Required]
        [Range(0.01, double.MaxValue, ErrorMessage = "Amount must be greater than zero")]
        public decimal Amount { get; set; }

        [Required]
        public string Currency { get; set; } = string.Empty;

        [Required]
        public string PaymentMethod { get; set; } = string.Empty;

        // Make CardDetails nullable - this is critical for when payment method is not 'card'
        public CardDetails? CardDetails { get; set; }
    }

    public class CardDetails
    {
        [Required(ErrorMessage = "Card number is required")]
        [RegularExpression(@"^\d{16}$", ErrorMessage = "Card number must be 16 digits")]
        public string CardNumber { get; set; } = string.Empty;

        [Required(ErrorMessage = "Expiry date is required")]
        [RegularExpression(@"^\d{2}/\d{2}$", ErrorMessage = "Expiry date must be in MM/YY format")]
        public string ExpiryDate { get; set; } = string.Empty;

        [Required(ErrorMessage = "CVV is required")]
        [RegularExpression(@"^\d{3,4}$", ErrorMessage = "CVV must be 3 or 4 digits")]
        public string CVV { get; set; } = string.Empty;

        [Required(ErrorMessage = "Cardholder name is required")]
        public string CardHolderName { get; set; } = string.Empty;
    }

    public class DepositResponse
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public decimal Amount { get; set; }
        public string Currency { get; set; } = string.Empty;
        public string PaymentMethod { get; set; } = string.Empty;
        public string Status { get; set; } = "Completed";
        public DateTime Timestamp { get; set; } = DateTime.UtcNow;
        public string TransactionRef { get; set; } = Guid.NewGuid().ToString()[..8].ToUpper();
    }
}