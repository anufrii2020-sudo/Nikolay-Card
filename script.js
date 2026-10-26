/** Прямой чат с username; сообщение остаётся черновиком до отправки посетителем. */
function telegramChatLink(message) {
  return `https://t.me/Nikolai_Makes_Sense?text=${encodeURIComponent(message)}`;
}

// Такие же полноценные href уже есть в HTML и работают без JavaScript.
// При изменении data-telegram-message ссылка обновится автоматически.
document.querySelectorAll('a[data-telegram-message]').forEach((link) => {
  link.href = telegramChatLink(link.dataset.telegramMessage);
});

/** Разворачиваем только Mini App, запущенный Telegram с данными инициализации. */
function initTelegramMiniApp() {
  const webApp = window.Telegram && window.Telegram.WebApp;
  // В обычном браузере SDK также может существовать, но initData остаётся пустым.
  if (!webApp || !webApp.initData) return;

  try {
    if (typeof webApp.ready === 'function') webApp.ready();
  } catch (error) {
    // Недоступный мост Telegram не должен мешать странице и контактным ссылкам.
  }

  try {
    if (typeof webApp.expand === 'function') webApp.expand();
  } catch (error) {
    // Старые или ограниченные клиенты могут не поддерживать разворачивание.
  }
}

initTelegramMiniApp();
