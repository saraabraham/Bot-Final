// Add to RemittanceTransaction.cs or create a new file

namespace RemittanceAPI.Models
{
    public class UserBalanceResponse
    {
        public decimal Balance { get; set; }
        public string Currency { get; set; } = "USD";
    }
}