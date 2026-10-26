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

test('diagnose authenticates the exact key without any Telegram API call', async (t) => {
  const mock = t.mock.method(globalThis, 'fetch', async () => { throw Error('must not call'); });
  const response = await worker.fetch(owner('diagnose'), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.telegram_checked, false);
  assert.equal(body.diagnostics.authenticated, true);
  assert.equal(body.diagnostics.setup_key_present, true);
  assert.equal(body.diagnostics.setup_key_format_valid, true);
  assert.equal(mock.mock.callCount(), 0);
});

test('setup accepts password-manager punctuation and case-insensitive Bearer scheme', async (t) => {
  const mock = t.mock.method(globalThis, 'fetch', async () => { throw Error('must not call'); });
  const withPunctuation = { ...env, SETUP_KEY: 'Synthetic!Owner#Password$With%Punctuation' };
  const request = owner('diagnose', withPunctuation.SETUP_KEY);
  request.headers.set('Authorization', `bEaReR\t ${withPunctuation.SETUP_KEY}`);
  const response = await worker.fetch(request, withPunctuation);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).diagnostics.authenticated, true);
  assert.equal(mock.mock.callCount(), 0);
});

for (const [name, key, reason] of [
  ['absent binding', undefined, 'setup_key_missing'],
  ['empty binding', '', 'setup_key_missing'],
  ['non-string binding', { secret: 'fixture' }, 'setup_key_missing'],
  ['short binding', 'short', 'setup_key_invalid_format'],
  ['long binding', 's'.repeat(257), 'setup_key_invalid_format'],
  ['newline in binding', env.SETUP_KEY + '\n', 'setup_key_invalid_format'],
  ['leading space in binding', ' ' + env.SETUP_KEY, 'setup_key_invalid_format'],
  ['internal space in binding', 'synthetic fixture with whitespace', 'setup_key_invalid_format'],
  ['non-ASCII binding', 'синтетический-тестовый-ключ', 'setup_key_invalid_format'],
]) {
  test(`safe diagnosis for ${name}`, async (t) => {
    const mock = t.mock.method(globalThis, 'fetch', async () => { throw Error('must not call'); });
    const response = await worker.fetch(owner('diagnose'), { ...env, SETUP_KEY: key });
    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.reason, reason);
    assert.equal(body.diagnostics.authenticated, false);
    assert.equal(mock.mock.callCount(), 0);
  });
}

test('missing/invalid Authorization is distinguished without accepting unauthenticated actions', async (t) => {
  const mock = t.mock.method(globalThis, 'fetch', async () => { throw Error('must not call'); });
  for (const action of ['diagnose', 'check', 'connect']) {
    for (const header of [null, 'Basic synthetic', 'Bearer short', 'Bearer synthetic key with spaces']) {
      const request = owner(action);
      if (header === null) request.headers.delete('Authorization');
      else request.headers.set('Authorization', header);
      const response = await worker.fetch(request, env);
      assert.equal(response.status, 403);
      const body = await response.json();
      assert.equal(body.reason, header === null ? 'authorization_missing' : 'authorization_invalid_format');
      assert.equal(body.diagnostics.authorization_present, header !== null);
      assert.equal(body.diagnostics.authenticated, false);
    }
  }
  assert.equal(mock.mock.callCount(), 0);
});

test('exact comparison rejects first/last/case/length changes and never trims the stored key', async (t) => {
  const mock = t.mock.method(globalThis, 'fetch', async () => { throw Error('must not call'); });
  for (const candidate of [
    'X' + env.SETUP_KEY.slice(1), env.SETUP_KEY.slice(0, -1) + 'X',
    env.SETUP_KEY.toUpperCase(), env.SETUP_KEY + 'X', env.SETUP_KEY.slice(0, -1),
  ]) {
    const response = await worker.fetch(owner('diagnose', candidate), env);
    assert.equal(response.status, 403);
    assert.equal((await response.json()).reason, 'key_mismatch');
  }
  assert.equal(mock.mock.callCount(), 0);
});

test('diagnostics is an allowlist without values, secret lengths, fragments or hashes', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw Error('must not call'); });
  const version = '01234567-89ab-cdef-0123-456789abcdef';
  const metadata = { ...env, CF_VERSION_METADATA: { id: version, tag: env.SETUP_KEY } };
  const response = await worker.fetch(owner('diagnose', 'synthetic-but-incorrect-owner-key'), metadata);
  const body = await response.json();
  assert.deepEqual(Object.keys(body.diagnostics).sort(), [
    'revision', 'worker_version_id', 'setup_key_present', 'setup_key_format_valid',
    'bot_token_present', 'webhook_secret_present', 'bot_secrets_format_valid',
    'authorization_present', 'authorization_format_valid', 'authenticated',
  ].sort());
  assert.equal(body.diagnostics.worker_version_id, version);
  for (const [key, value] of Object.entries(body.diagnostics)) {
    if (!['revision', 'worker_version_id'].includes(key)) assert.equal(typeof value, 'boolean');
  }
  const text = JSON.stringify(body);
  for (const secret of Object.values(env)) {
    assert.ok(!text.includes(secret));
    assert.ok(!text.includes(secret.slice(0, 12)));
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
    assert.ok(!text.includes(Buffer.from(digest).toString('hex')));
    assert.ok(!text.includes(Buffer.from(digest).toString('base64')));
  }
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

test('public setup renders binding booleans and only a validated version UUID, never secrets', async () => {
  const response = await worker.fetch(new Request('https://worker.example/setup'), {
    ...env, CF_VERSION_METADATA: { id: '<script>' + env.SETUP_KEY + '</script>' },
  });
  const html = await response.text();
  assert.ok(html.includes('setup-auth-v2'));
  assert.ok(html.includes('"setup_key_present": true'));
  assert.ok(html.includes('"worker_version_id": null'));
  assert.ok(!html.includes('__SETUP_DEPLOYMENT__'));
  for (const secret of Object.values(env)) assert.ok(!html.includes(secret));
});

test('key-only diagnosis can run when bot secrets are absent, but check/connect still fail closed', async (t) => {
  const mock = t.mock.method(globalThis, 'fetch', async () => { throw Error('must not call'); });
  const onlyOwner = { SETUP_KEY: env.SETUP_KEY };
  assert.equal((await worker.fetch(owner('diagnose'), onlyOwner)).status, 200);
  for (const action of ['check', 'connect']) {
    const response = await worker.fetch(owner(action), onlyOwner);
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.error, 'secrets_not_configured');
    assert.equal(body.diagnostics.bot_secrets_format_valid, false);
  }
  assert.equal(mock.mock.callCount(), 0);
});
