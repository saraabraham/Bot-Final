// Fixed User.cs model with proper nullable annotations

using System;
using System.Collections.Generic;

namespace RemittanceAPI.Models
{
    public class User
    {
        public string Id { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string PasswordHash { get; set; } = string.Empty;
        public string? Phone { get; set; }
        public decimal Balance { get; set; } = 1000.0m; // Default starting balance

        // Make sure this property exists for storing recipient IDs
        public List<string> SavedRecipients { get; set; } = new List<string>();

        public string PreferredCurrency { get; set; } = "USD";
    }

    public class LoginRequest
    {
        public string Email { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
    }

    public class LoginResponse
    {
        public string Id { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string Token { get; set; } = string.Empty;
        public string? Phone { get; set; }
        public string PreferredCurrency { get; set; } = "USD";
        public bool IsAuthenticated { get; set; } = true;
    }
}