import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.js';

// Synthetic fixtures only. No live credentials or Telegram requests are used.
const env = {
  BOT_TOKEN: '00000000:TEST_FIXTURE_NOT_A_REAL_BOT_TOKEN',
  WEBHOOK_SECRET: 'webhook-test-fixture-not-a-real-secret',
  SETUP_KEY: 'setup-test-fixture-not-a-real-secret',
};
const greeting = 'Здравствуйте!\n\nЯ Николай. Более 15 лет работаю в грузоперевозках.\n\nПомогаю перевозчикам с топливом, грузовыми шинами и загрузками.\n\nОткройте визитку, выберите направление и напишите мне напрямую.';
function update(text = '/start') {
  return { update_id: 1, message: { message_id: 1, text,
    chat: { id: 12345, type: 'private' }, from: { id: 12345, is_bot: false } } };
}
function incoming(payload = update(), secret = env.WEBHOOK_SECRET) {
  return new Request('https://worker.example/webhook', {
    method: 'POST', headers: { 'Content-Type': 'application/json',
      ...(secret ? { 'X-Telegram-Bot-Api-Secret-Token': secret } : {}) },
    body: JSON.stringify(payload),
  });
}
function owner(action, key = env.SETUP_KEY) {
  return new Request('https://worker.example/setup', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ action }),
  });
}

test('exact welcome and Mini App button, no token or storage in reply', async () => {
  const response = await worker.fetch(incoming(), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body, { method: 'sendMessage', chat_id: 12345, text: greeting,
    reply_markup: { inline_keyboard: [[{ text: 'Открыть визитку', url: 'https://t.me/NikolayTransportBot/card' }]] } });
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  for (const value of Object.values(env)) assert.ok(!JSON.stringify(body).includes(value));
});

for (const command of ['/start', '/start payload', '/start@NikolayTransportBot', '/START@NikolayTransportBot payload']) {
  test(`accept explicit command ${command}`, async () => {
    assert.equal((await (await worker.fetch(incoming(update(command)), env)).json()).method, 'sendMessage');
  });
}
for (const text of ['/startx', '/start@OtherBot', '/help', 'Здравствуйте', 'hello /start', '']) {
  test(`ignore non-start message ${JSON.stringify(text)}`, async () => {
    assert.deepEqual(await (await worker.fetch(incoming(update(text)), env)).json(), { ok: true });
  });
}
for (const kind of ['group', 'supergroup', 'bot', 'no-sender', 'other-sender', 'channel', 'edited', 'callback']) {
  test(`ignore ${kind} update`, async () => {
    let payload = update();
    if (kind === 'group' || kind === 'supergroup') payload.message.chat.type = kind;
    if (kind === 'bot') payload.message.from.is_bot = true;
    if (kind === 'no-sender') delete payload.message.from;
    if (kind === 'other-sender') payload.message.from.id = 999;
    if (kind === 'channel') payload = { channel_post: payload.message };
    if (kind === 'edited') payload = { edited_message: payload.message };
    if (kind === 'callback') payload = { callback_query: { data: '/start' } };
    assert.deepEqual(await (await worker.fetch(incoming(payload), env)).json(), { ok: true });
  });
}

test('reject missing and wrong webhook secret before JSON parsing', async () => {
  for (const secret of [null, 'wrong-secret']) {
    const r = incoming({}, secret);
    const response = await worker.fetch(new Request(r, { body: 'bad json' }), env);
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { ok: false, error: 'forbidden' });
  }
});
test('reject malformed authenticated JSON and content type', async () => {
  let r = new Request(incoming(), { body: '{bad' });
  assert.equal((await worker.fetch(r, env)).status, 400);
  r = incoming(); r.headers.set('Content-Type', 'text/plain');
  assert.equal((await worker.fetch(r, env)).status, 415);
});
test('missing/invalid deployment secrets fail closed', async () => {
  for (const bad of [{}, { ...env, BOT_TOKEN: 'invalid' }, { ...env, WEBHOOK_SECRET: 'short' }]) {
    assert.equal((await worker.fetch(incoming(), bad)).status, 503);
  }
});
test('only POST accepts updates; health does not send messages', async () => {
  assert.equal((await worker.fetch(new Request('https://worker.example/webhook'), env)).status, 405);
  assert.equal((await worker.fetch(new Request('https://worker.example/unknown'), env)).status, 404);
  assert.deepEqual(await (await worker.fetch(new Request('https://worker.example/health'), env)).json(), { reachable: true });
});
test('setup page never contains any configured secret', async () => {
  const response = await worker.fetch(new Request('https://worker.example/setup'), env);
  const text = await response.text();
  assert.equal(response.status, 200);
  for (const value of Object.values(env)) assert.ok(!text.includes(value));
  assert.ok(response.headers.get('Content-Security-Policy').includes("connect-src 'self'"));
});

test('owner authorization gates every Telegram API call', async (t) => {
  const mock = t.mock.method(globalThis, 'fetch', async () => { throw Error('must not call'); });
  assert.equal((await worker.fetch(owner('connect', 'incorrect'), env)).status, 403);
  assert.equal((await worker.fetch(owner('connect'), { ...env, SETUP_KEY: undefined })).status, 403);
  assert.equal(mock.mock.callCount(), 0);
});
test('unknown setup action does not call Telegram', async (t) => {
  const mock = t.mock.method(globalThis, 'fetch', async () => { throw Error('must not call'); });
  assert.equal((await worker.fetch(owner('unknown'), env)).status, 400);
  assert.equal(mock.mock.callCount(), 0);
});

function mockTelegram(t, { wrongBot = false, connected = true } = {}) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const method = new URL(url).pathname.split('/').pop();
    const body = JSON.parse(options.body); calls.push({ method, body });
    let result;
    if (method === 'getMe') result = { is_bot: true, username: wrongBot ? 'OtherBot' : 'NikolayTransportBot' };
    else if (method === 'setWebhook') result = true;
    else if (method === 'getWebhookInfo') result = { url: connected ? 'https://worker.example/webhook' : '', pending_update_count: 0 };
    else throw Error('unexpected API method');
    return Response.json({ ok: true, result });
  });
  return calls;
}
test('check is read-only and returns no secret or raw Telegram data', async (t) => {
  const calls = mockTelegram(t, { connected: false });
  const response = await worker.fetch(owner('check'), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.webhook_connected_here, false);
  assert.deepEqual(calls.map(c => c.method), ['getMe', 'getWebhookInfo']);
  for (const value of Object.values(env)) assert.ok(!JSON.stringify(body).includes(value));
});
test('connect registers secret_token and keeps Menu Button and pending updates', async (t) => {
  const calls = mockTelegram(t);
  const response = await worker.fetch(owner('connect'), env);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).webhook_connected_here, true);
  assert.deepEqual(calls.map(c => c.method), ['getMe', 'setWebhook', 'getWebhookInfo']);
  assert.deepEqual(calls[1].body, { url: 'https://worker.example/webhook', secret_token: env.WEBHOOK_SECRET,
    allowed_updates: ['message'], max_connections: 1, drop_pending_updates: false });
});
test('wrong bot token cannot register webhook for another bot', async (t) => {
  const calls = mockTelegram(t, { wrongBot: true });
  assert.equal((await worker.fetch(owner('connect'), env)).status, 409);
  assert.deepEqual(calls.map(c => c.method), ['getMe']);
});
test('Telegram network exception cannot leak token or raw exception', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw Error(`failed https://api.telegram.org/bot${env.BOT_TOKEN}/getMe`); });
  const response = await worker.fetch(owner('connect'), env);
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { ok: false, error: 'telegram_unavailable' });
});
test('Telegram API errors are sanitized', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ ok: false, description: env.BOT_TOKEN }, { status: 401 }));
  const response = await worker.fetch(owner('connect'), env);
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { ok: false, error: 'telegram_unavailable' });
});
