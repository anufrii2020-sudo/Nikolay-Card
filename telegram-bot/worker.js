const BOT_USERNAME = 'NikolayTransportBot';
const MINI_APP_URL = 'https://t.me/NikolayTransportBot/card';
const GREETING = 'Здравствуйте!\n\nЯ Николай. Более 15 лет работаю в грузоперевозках.\n\nПомогаю перевозчикам с топливом, грузовыми шинами и загрузками.\n\nОткройте визитку, выберите направление и напишите мне напрямую.';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function configured(env) {
  return typeof env.BOT_TOKEN === 'string'
    && /^\d{5,20}:[A-Za-z0-9_-]{20,}$/.test(env.BOT_TOKEN)
    && typeof env.WEBHOOK_SECRET === 'string'
    && /^[A-Za-z0-9_-]{20,256}$/.test(env.WEBHOOK_SECRET);
}

async function sameSecret(actual, expected) {
  if (!actual || typeof expected !== 'string') return false;
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([actual, expected].map((value) =>
    crypto.subtle.digest('SHA-256', encoder.encode(value))));
  const left = new Uint8Array(a);
  const right = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}

async function webhook(request, env) {
  if (!configured(env)) return json({ ok: false, error: 'secrets_not_configured' }, 503);
  if (!await sameSecret(request.headers.get('X-Telegram-Bot-Api-Secret-Token'), env.WEBHOOK_SECRET)) {
    return json({ ok: false, error: 'forbidden' }, 403);
  }
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) {
    return json({ ok: false, error: 'json_required' }, 415);
  }
  let update;
  try { update = await request.json(); }
  catch { return json({ ok: false, error: 'invalid_json' }, 400); }

  const message = update?.message;
  const chat = message?.chat;
  const sender = message?.from;
  if (chat?.type !== 'private' || !Number.isSafeInteger(chat.id) || chat.id <= 0
      || sender?.id !== chat.id || sender?.is_bot !== false
      || typeof message?.text !== 'string'
      || !/^\/start(?:@NikolayTransportBot)?(?:\s+[\s\S]*)?$/i.test(message.text.trim())) {
    return json({ ok: true });
  }

  // Telegram Bot API supports invoking sendMessage in the webhook response.
  // No chat IDs, updates or messages are stored, and no background job is needed.
  return json({
    method: 'sendMessage',
    chat_id: chat.id,
    text: GREETING,
    reply_markup: {
      inline_keyboard: [[{ text: 'Открыть визитку', url: MINI_APP_URL }]],
    },
  });
}

async function telegram(env, method, body) {
  // Never log this URL, request, exception or Telegram's raw error description.
  const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const data = await response.json();
  if (!response.ok || data?.ok !== true) throw new Error('telegram_api_failed');
  return data.result;
}

async function setup(request, env) {
  const auth = request.headers.get('Authorization') || '';
  if (!/^[A-Za-z0-9_-]{20,256}$/.test(env.SETUP_KEY || '')
      || !await sameSecret(auth.startsWith('Bearer ') ? auth.slice(7) : '', env.SETUP_KEY)) {
    return json({ ok: false, error: 'forbidden' }, 403);
  }
  if (!configured(env)) return json({ ok: false, error: 'secrets_not_configured' }, 503);
  let action;
  try { ({ action } = await request.json()); }
  catch { return json({ ok: false, error: 'invalid_json' }, 400); }
  if (!['check', 'connect'].includes(action)) return json({ ok: false, error: 'invalid_action' }, 400);

  try {
    const bot = await telegram(env, 'getMe', {});
    if (bot?.is_bot !== true || bot?.username?.toLowerCase() !== BOT_USERNAME.toLowerCase()) {
      return json({ ok: false, error: 'wrong_bot' }, 409);
    }
    const target = new URL('/webhook', request.url).href;
    if (action === 'connect') {
      await telegram(env, 'setWebhook', {
        url: target,
        secret_token: env.WEBHOOK_SECRET,
        allowed_updates: ['message'],
        max_connections: 1,
        drop_pending_updates: false,
      });
    }
    const info = await telegram(env, 'getWebhookInfo', {});
    return json({
      ok: true,
      bot: BOT_USERNAME,
      webhook_connected_here: info?.url === target,
      another_webhook_exists: Boolean(info?.url && info.url !== target),
      pending_updates: info?.pending_update_count || 0,
      last_delivery_failed: Boolean(info?.last_error_date),
    });
  } catch {
    return json({ ok: false, error: 'telegram_unavailable' }, 502);
  }
}

const SETUP_PAGE = `<!doctype html><html lang="ru"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Подключение приветствия Николая</title>
<style>body{font:16px system-ui;max-width:560px;margin:24px auto;padding:0 18px;line-height:1.5}input,button{font:inherit;box-sizing:border-box;min-height:44px;padding:10px;width:100%;margin:6px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere}label{display:block}small{display:block}</style>
<h1>Приветствие /start</h1><p>Служебная настройка @NikolayTransportBot. Токен бота вводится только в Secrets Cloudflare, не на этой странице.</p>
<details><summary>Сгенерировать два секрета на этом устройстве</summary>
<p>Сохраните значения в менеджере паролей и добавьте их в Cloudflare как Secrets. Они генерируются локально и не отправляются серверу.</p>
<button id="generate" type="button">Создать WEBHOOK_SECRET и SETUP_KEY</button>
<label>WEBHOOK_SECRET<input id="generated-webhook" readonly autocomplete="off"></label>
<label>SETUP_KEY<input id="generated-setup" readonly autocomplete="off"></label></details>
<form id="form"><label>Ваш SETUP_KEY<input id="key" type="password" autocomplete="current-password" required></label>
<button type="button" id="check">Проверить подключение</button><button type="submit">Подключить webhook</button></form>
<small>«Подключить» назначит этот Worker обработчиком сообщений бота. Menu Button не меняется. Перед заменой существующего webhook проверьте, не используется ли он другой интеграцией.</small>
<pre id="result" role="status"></pre>
<script>
const output=document.getElementById('result');
function randomSecret(){const b=crypto.getRandomValues(new Uint8Array(32));return btoa(String.fromCharCode(...b)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');}
document.getElementById('generate').onclick=()=>{document.getElementById('generated-webhook').value=randomSecret();document.getElementById('generated-setup').value=randomSecret();};
async function run(action){
 const key=document.getElementById('key').value;
 if(!key){output.textContent='Введите SETUP_KEY из ваших секретов Cloudflare.';return;}
 output.textContent='Проверка…';
 try{const response=await fetch('/setup',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},body:JSON.stringify({action})});
 const result=await response.json();output.textContent=JSON.stringify(result,null,2);
 if(result.ok&&result.webhook_connected_here&&action==='connect'){output.textContent+='\\nWebhook подключён. Теперь отправьте /start боту и проверьте реальный ответ.';document.getElementById('key').value='';}}
 catch{output.textContent='Не удалось выполнить проверку. Повторите позже.';}
}
document.getElementById('check').onclick=()=>run('check');
document.getElementById('form').onsubmit=(event)=>{event.preventDefault();run('connect');};
</script></html>`;

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === '/setup' && request.method === 'GET') {
      return new Response(SETUP_PAGE, { headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'",
      } });
    }
    if (path === '/webhook' || path === '/setup') {
      if (request.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405);
      return path === '/webhook' ? webhook(request, env) : setup(request, env);
    }
    if (path === '/health' && request.method === 'GET') return json({ reachable: true });
    return json({ ok: false, error: 'not_found' }, 404);
  },
};
