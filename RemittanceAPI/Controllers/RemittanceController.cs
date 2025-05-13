using System;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using RemittanceAPI.Models;
using RemittanceAPI.Services;

namespace RemittanceAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class RemittanceController : ControllerBase
    {
        private readonly RemittanceService _remittanceService;
        private readonly ILogger<RemittanceController> _logger;

        public RemittanceController(
            RemittanceService remittanceService,
            ILogger<RemittanceController> logger)
        {
            _remittanceService = remittanceService;
            _logger = logger;
        }

        [HttpGet("rate")]
        public async Task<IActionResult> GetExchangeRate([FromQuery] string from, [FromQuery] string to)
        {
            if (string.IsNullOrEmpty(from) || string.IsNullOrEmpty(to))
            {
                return BadRequest(new { message = "Both 'from' and 'to' currencies are required" });
            }

            try
            {
                var rate = await _remittanceService.GetExchangeRateAsync(from, to);
                return Ok(rate);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error getting exchange rate from {from} to {to}");
                return StatusCode(500, new { message = "An error occurred while getting exchange rate" });
            }
        }

        [HttpGet("fees")]
        public async Task<IActionResult> CalculateFees([FromQuery] decimal amount, [FromQuery] string currency, [FromQuery] string method)
        {
            if (amount <= 0)
            {
                return BadRequest(new { message = "Amount must be greater than zero" });
            }

            if (string.IsNullOrEmpty(currency) || string.IsNullOrEmpty(method))
            {
                return BadRequest(new { message = "Currency and payment method are required" });
            }

            try
            {
                var fees = await _remittanceService.CalculateFeesAsync(amount, currency, method);
                return Ok(fees);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error calculating fees for {amount} {currency} using {method}");
                return StatusCode(500, new { message = "An error occurred while calculating fees" });
            }
        }

        [Authorize]
        [HttpGet("recipients")]
        public async Task<IActionResult> GetSavedRecipients()
        {
            try
            {
                string userId = User.FindFirst("sub")?.Value;
                _logger.LogInformation($"GetSavedRecipients - User ID from token: {userId}");

                if (string.IsNullOrEmpty(userId))
                {
                    // Try alternative claim types
                    userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                    _logger.LogInformation($"GetSavedRecipients - User ID from NameIdentifier: {userId}");

                    if (string.IsNullOrEmpty(userId))
                    {
                        return BadRequest(new { message = "User ID not found in token" });
                    }
                }

                var recipients = await _remittanceService.GetSavedRecipientsAsync(userId);
                return Ok(recipients);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving saved recipients");
                return StatusCode(500, new { message = "An error occurred while retrieving saved recipients", error = ex.Message });
            }
        }

        [Authorize]
        [HttpPost("recipients")]
        public async Task<IActionResult> SaveRecipient([FromBody] Recipient recipient)
        {
            if (recipient == null)
            {
                return BadRequest(new { message = "Recipient data is required" });
            }

            try
            {
                var savedRecipient = await _remittanceService.SaveRecipientAsync(recipient);
                return CreatedAtAction(nameof(GetSavedRecipients), null, savedRecipient);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error saving recipient {recipient.Name}");
                return StatusCode(500, new { message = $"An error occurred while saving recipient: {ex.Message}" });
            }
        }

        [Authorize]
        [HttpPost("send")]
        public async Task<IActionResult> SendMoney([FromBody] RemittanceTransaction transaction)
        {
            if (transaction == null)
            {
                return BadRequest(new { message = "Transaction data is required" });
            }

            try
            {
                string userId = User.FindFirst("sub")?.Value;
                if (string.IsNullOrEmpty(userId))
                {
                    // Try alternative claim types
                    userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                    _logger.LogInformation($"SendMoney - User ID from NameIdentifier: {userId}");

                    if (string.IsNullOrEmpty(userId))
                    {
                        return BadRequest(new { message = "User ID not found in token" });
                    }
                }

                // Set the sender ID from the authenticated user
                transaction.SenderId = userId;

                // Log the incoming transaction data for debugging
                _logger.LogInformation($"Received transaction: Amount={transaction.Amount}, " +
                    $"Currency={transaction.Currency}, " +
                    $"RecipientId={transaction.Recipient?.Id ?? "null"}, " +
                    $"RecipientName={transaction.Recipient?.Name ?? "null"}, " +
                    $"PaymentMethod={transaction.PaymentMethod}");

                // Validate recipient
                if (transaction.Recipient == null)
                {
                    return BadRequest(new { message = "Recipient information is required" });
                }

                // Always ensure we have a fresh ID for each transaction
                transaction.Id = Guid.NewGuid().ToString();

                // Make sure required fields are present
                if (transaction.Amount <= 0)
                {
                    return BadRequest(new { message = "Amount must be greater than zero" });
                }

                if (string.IsNullOrEmpty(transaction.Currency))
                {
                    return BadRequest(new { message = "Currency is required" });
                }

                if (string.IsNullOrEmpty(transaction.PaymentMethod))
                {
                    return BadRequest(new { message = "Payment method is required" });
                }

                var result = await _remittanceService.SendMoneyAsync(transaction);
                return CreatedAtAction(nameof(GetTransactionStatus), new { id = result.Id }, result);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing transaction");
                return StatusCode(500, new { message = $"Error processing transaction: {ex.Message}" });
            }
        }
        [Authorize]
        [HttpGet("history")]
        public async Task<IActionResult> GetTransactionHistory()
        {
            try
            {
                string userId = User.FindFirst("sub")?.Value;
                if (string.IsNullOrEmpty(userId))
                {
                    return BadRequest(new { message = "User ID not found" });
                }

                var history = await _remittanceService.GetTransactionHistoryAsync(userId);
                return Ok(history);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving transaction history");
                return StatusCode(500, new { message = "An error occurred while retrieving transaction history" });
            }
        }

        [Authorize]
        [HttpGet("status/{id}")]
        public async Task<IActionResult> GetTransactionStatus(string id)
        {
            if (string.IsNullOrEmpty(id))
            {
                return BadRequest(new { message = "Transaction ID is required" });
            }

            try
            {
                var transaction = await _remittanceService.GetTransactionStatusAsync(id);
                if (transaction == null)
                {
                    return NotFound(new { message = $"Transaction {id} not found" });
                }

                return Ok(transaction);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error retrieving transaction status for {id}");
                return StatusCode(500, new { message = "An error occurred while retrieving transaction status" });
            }
        }

        // Add these endpoints to the RemittanceController.cs

        // Add this endpoint to check balance
        [Authorize]
        [HttpGet("balance")]
        public async Task<IActionResult> GetUserBalance()
        {
            try
            {
                string userId = User.FindFirst("sub")?.Value;
                if (string.IsNullOrEmpty(userId))
                {
                    userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                    _logger.LogInformation($"GetUserBalance - User ID from NameIdentifier: {userId}");

                    if (string.IsNullOrEmpty(userId))
                    {
                        return BadRequest(new { message = "User ID not found in token" });
                    }
                }

                var balance = await _remittanceService.CheckUserBalanceAsync(userId);
                return Ok(balance);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving user balance");
                return StatusCode(500, new { message = "An error occurred while retrieving user balance", error = ex.Message });
            }
        }

        // Add this endpoint to find or create a recipient
        [Authorize]
        [HttpPost("recipients/find-or-create")]
        public async Task<IActionResult> FindOrCreateRecipient([FromBody] FindRecipientRequest request)
        {
            if (string.IsNullOrEmpty(request.Name))
            {
                return BadRequest(new { message = "Recipient name is required" });
            }

            try
            {
                string userId = User.FindFirst("sub")?.Value;
                if (string.IsNullOrEmpty(userId))
                {
                    userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

                    if (string.IsNullOrEmpty(userId))
                    {
                        return BadRequest(new { message = "User ID not found in token" });
                    }
                }

                var recipient = await _remittanceService.FindOrCreateRecipientAsync(request.Name, userId);
                return Ok(recipient);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error finding or creating recipient {request.Name}");
                return StatusCode(500, new { message = $"An error occurred: {ex.Message}" });
            }
        }
    }
}