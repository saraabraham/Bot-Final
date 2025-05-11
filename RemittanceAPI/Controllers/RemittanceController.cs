using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RemittanceAPI.Models;
using RemittanceAPI.Services;

namespace RemittanceAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class RemittanceController : ControllerBase
    {
        private readonly RemittanceService _remittanceService;

        public RemittanceController(RemittanceService remittanceService)
        {
            _remittanceService = remittanceService;
        }

        [HttpGet("rate")]
        public async Task<IActionResult> GetExchangeRate([FromQuery] string from, [FromQuery] string to)
        {
            if (string.IsNullOrEmpty(from) || string.IsNullOrEmpty(to))
            {
                return BadRequest(new { message = "Both 'from' and 'to' currencies are required" });
            }

            var rate = await _remittanceService.GetExchangeRateAsync(from, to);

            return Ok(rate);
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

            var fees = await _remittanceService.CalculateFeesAsync(amount, currency, method);

            return Ok(fees);
        }

        [Authorize]
        [HttpGet("recipients")]
        public async Task<IActionResult> GetSavedRecipients()
        {
            string userId = User.FindFirst("sub")?.Value;

            var recipients = await _remittanceService.GetSavedRecipientsAsync(userId);

            return Ok(recipients);
        }

        [Authorize]
        [HttpPost("recipients")]
        public async Task<IActionResult> SaveRecipient([FromBody] Recipient recipient)
        {
            if (recipient == null)
            {
                return BadRequest(new { message = "Recipient data is required" });
            }

            var savedRecipient = await _remittanceService.SaveRecipientAsync(recipient);

            return CreatedAtAction(nameof(GetSavedRecipients), null, savedRecipient);
        }

        [Authorize]
        [HttpPost("send")]
        public async Task<IActionResult> SendMoney([FromBody] RemittanceTransaction transaction)
        {
            if (transaction == null)
            {
                return BadRequest(new { message = "Transaction data is required" });
            }

            string userId = User.FindFirst("sub")?.Value;
            transaction.SenderId = userId;

            var result = await _remittanceService.SendMoneyAsync(transaction);

            return CreatedAtAction(nameof(GetTransactionStatus), new { id = result.Id }, result);
        }

        [Authorize]
        [HttpGet("history")]
        public async Task<IActionResult> GetTransactionHistory()
        {
            string userId = User.FindFirst("sub")?.Value;

            var history = await _remittanceService.GetTransactionHistoryAsync(userId);

            return Ok(history);
        }

        [Authorize]
        [HttpGet("status/{id}")]
        public async Task<IActionResult> GetTransactionStatus(string id)
        {
            if (string.IsNullOrEmpty(id))
            {
                return BadRequest(new { message = "Transaction ID is required" });
            }

            var transaction = await _remittanceService.GetTransactionStatusAsync(id);

            if (transaction == null)
            {
                return NotFound(new { message = $"Transaction {id} not found" });
            }

            return Ok(transaction);
        }
    }
}