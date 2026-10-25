/** Прямой чат с username; сообщение остаётся черновиком до отправки посетителем. */
function telegramChatLink(message) {
  return `https://t.me/Nikolai_Makes_Sense?text=${encodeURIComponent(message)}`;
}

// Такие же полноценные href уже есть в HTML и работают без JavaScript.
// При изменении data-telegram-message ссылка обновится автоматически.
document.querySelectorAll('a[data-telegram-message]').forEach((link) => {
  link.href = telegramChatLink(link.dataset.telegramMessage);
});
