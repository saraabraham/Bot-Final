using System;
using System.Collections.Generic;

namespace RemittanceAPI.Models
{
    public class User
    {
        public string Id { get; set; } = Guid.NewGuid().ToString();
        public string Name { get; set; }
        public string Email { get; set; }
        public string PasswordHash { get; set; }
        public string? Phone { get; set; }

        // Make sure this property exists for storing recipient IDs
        public List<string> SavedRecipients { get; set; } = new List<string>();

        public string PreferredCurrency { get; set; } = "USD";
    }

    public class LoginRequest
    {
        public string Email { get; set; }
        public string Password { get; set; }
    }

    public class LoginResponse
    {
        public string Id { get; set; }
        public string Name { get; set; }
        public string Email { get; set; }
        public string Token { get; set; }
        public string? Phone { get; set; }
        public string PreferredCurrency { get; set; }
        public bool IsAuthenticated { get; set; } = true;
    }
}