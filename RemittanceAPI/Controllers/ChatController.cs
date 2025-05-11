using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RemittanceAPI.Models;
using RemittanceAPI.Services;

namespace RemittanceAPI.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class ChatController : ControllerBase
    {
        private readonly ChatbotService _chatbotService;

        public ChatController(ChatbotService chatbotService)
        {
            _chatbotService = chatbotService;
        }

        [HttpPost("message")]
        public async Task<IActionResult> ProcessMessage([FromBody] UserMessage message)
        {
            if (string.IsNullOrEmpty(message.Text))
            {
                return BadRequest(new { message = "Message text is required" });
            }

            // In a real app, we would get the user ID from the authenticated user
            string userId = User.Identity.IsAuthenticated ? User.FindFirst("sub")?.Value : null;

            var command = await _chatbotService.ProcessMessageAsync(message.Text, userId);

            return Ok(command);
        }

        [HttpPost("voice")]
        public async Task<IActionResult> ProcessVoice(IFormFile audio)
        {
            if (audio == null || audio.Length == 0)
            {
                return BadRequest(new { message = "Audio file is required" });
            }

            // In a real app, we would get the user ID from the authenticated user
            string userId = User.Identity.IsAuthenticated ? User.FindFirst("sub")?.Value : null;

            using var stream = audio.OpenReadStream();
            var command = await _chatbotService.ProcessVoiceAsync(stream, userId);

            return Ok(command);
        }

        [Authorize]
        [HttpGet("history")]
        public async Task<IActionResult> GetChatHistory([FromQuery] int limit = 50)
        {
            string userId = User.FindFirst("sub")?.Value;

            var history = await _chatbotService.GetChatHistoryAsync(userId, limit);

            return Ok(history);
        }
    }
}