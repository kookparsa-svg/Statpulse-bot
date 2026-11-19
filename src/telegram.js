const API = 'https://api.telegram.org';

export class TelegramError extends Error {
  constructor(method, code, description, retryAfter) {
    super(`${method}: ${description}`);
    this.code = code;
    this.description = description;
    this.retryAfter = retryAfter;
  }
}

async function call(env, method, payload = {}) {
  if (!env.BOT_TOKEN) throw new Error('BOT_TOKEN secret is not configured');
  const res = await fetch(`${API}/bot${env.BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  let data;
  try {
    data = await res.json();
  } catch {
    data = { ok: false, description: `HTTP ${res.status}` };
  }
  if (!data.ok) {
    throw new TelegramError(method, data.error_code ?? res.status, data.description ?? 'unknown', data.parameters?.retry_after);
  }
  return data.result;
}

const clip = (s) => (s.length > 4000 ? `${s.slice(0, 3990)}…` : s);

export const sendMessage = (env, chatId, text, replyMarkup) =>
  call(env, 'sendMessage', {
    chat_id: chatId,
    text: clip(text),
    parse_mode: 'HTML',
    link_preview_options: { is_disabled: true },
    reply_markup: replyMarkup,
  });

/** Returns false when Telegram says the content did not change. */
export async function editMessageText(env, chatId, messageId, text, replyMarkup) {
  try {
    await call(env, 'editMessageText', {
      chat_id: chatId,
      message_id: messageId,
      text: clip(text),
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      reply_markup: replyMarkup,
    });
    return true;
  } catch (e) {
    if (e instanceof TelegramError && /message is not modified/i.test(e.description)) return false;
    throw e;
  }
}

export const answerCallback = (env, id, text, alert = false) =>
  call(env, 'answerCallbackQuery', {
    callback_query_id: id,
    text: text ? String(text).slice(0, 200) : undefined,
    show_alert: alert || undefined,
  });

export const setWebhook = (env, url) =>
  call(env, 'setWebhook', {
    url,
    secret_token: env.WEBHOOK_SECRET,
    allowed_updates: ['message', 'callback_query'],
    max_connections: 20,
  });

export const getWebhookInfo = (env) => call(env, 'getWebhookInfo');

export const setMyCommands = (env) =>
  call(env, 'setMyCommands', {
    commands: [
      { command: 'menu', description: 'Main menu' },
      { command: 'dashboard', description: 'Dashboard' },
      { command: 'stats', description: 'Live statistics' },
      { command: 'analytics', description: 'Analytics' },
      { command: 'settings', description: 'Settings' },
      { command: 'help', description: 'Help' },
    ],
  });
