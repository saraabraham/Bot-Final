using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using RemittanceAPI.Data;
using RemittanceAPI.Models;
using System;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Threading.Tasks;

namespace RemittanceAPI.Services
{
    public class AuthService
    {
        private readonly IConfiguration _configuration;
        private readonly RemittanceDbContext _dbContext;

        public AuthService(
            IConfiguration configuration,
            RemittanceDbContext dbContext)
        {
            _configuration = configuration;
            _dbContext = dbContext;
        }

        public async Task<LoginResponse> Login(LoginRequest request)
        {
            // In a real app, we would properly verify the password hash
            var user = await _dbContext.Users
                .FirstOrDefaultAsync(u =>
                    u.Email == request.Email &&
                    u.PasswordHash == request.Password);

            if (user == null)
            {
                return null;
            }

            var token = GenerateJwtToken(user);

            return new LoginResponse
            {
                Id = user.Id,
                Name = user.Name,
                Email = user.Email,
                Token = token,
                Phone = user.Phone,
                PreferredCurrency = user.PreferredCurrency
            };
        }

        private string GenerateJwtToken(User user)
        {
            var claims = new[]
            {
                new Claim(JwtRegisteredClaimNames.Sub, user.Id),
                new Claim(JwtRegisteredClaimNames.Email, user.Email),
                new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
            };

            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_configuration["JWT:Secret"]));
            var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

            var token = new JwtSecurityToken(
                issuer: _configuration["JWT:ValidIssuer"],
                audience: _configuration["JWT:ValidAudience"],
                claims: claims,
                expires: DateTime.Now.AddDays(1),
                signingCredentials: creds);

            return new JwtSecurityTokenHandler().WriteToken(token);
        }

        public async Task<User> GetUserById(string userId)
        {
            return await _dbContext.Users.FirstOrDefaultAsync(u => u.Id == userId);
        }
    }
}