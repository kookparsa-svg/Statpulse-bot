import { handleUpdate } from './handlers/router.js';
import { runScheduled } from './services/cron.js';
import { setMyCommands, setWebhook } from './telegram.js';
import { safeEqual } from './utils/validate.js';

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });

function missingConfig(env, names) {
  return names.filter((n) => !env[n]);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/webhook' && request.method === 'POST') return await webhook(request, env);
      if (url.pathname === '/register' && (request.method === 'GET' || request.method === 'POST')) return await register(request, env, url);
      if (url.pathname === '/health') return json({ ok: true });
      return new Response('Not found', { status: 404 });
    } catch (err) {
      console.error('fetch error:', err?.message);
      return json({ ok: false, error: 'internal' }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runScheduled(env, event));
  },
};

async function webhook(request, env) {
  const missing = missingConfig(env, ['DB', 'BOT_TOKEN', 'WEBHOOK_SECRET']);
  if (missing.length) return json({ ok: false, error: `missing config: ${missing.join(', ')}` }, 500);

  const header = request.headers.get('X-Telegram-Bot-Api-Secret-Token') ?? '';
  if (!safeEqual(header, env.WEBHOOK_SECRET)) return new Response('Forbidden', { status: 403 });

  if (Number(request.headers.get('content-length') ?? 0) > 200_000) return json({ ok: true });
  let update;
  try {
    update = await request.json();
  } catch {
    return json({ ok: false, error: 'bad json' }, 400);
  }
  try {
    await handleUpdate(update, env);
  } catch (err) {
    // Always answer 200 so Telegram does not retry-loop on a poison update.
    console.error('update failed', update?.update_id, err?.message);
  }
  return json({ ok: true });
}

/** GET/POST /register  (Authorization: Bearer <SETUP_KEY>  or  ?key=<SETUP_KEY>) */
async function register(request, env, url) {
  const missing = missingConfig(env, ['BOT_TOKEN', 'WEBHOOK_SECRET', 'SETUP_KEY']);
  if (missing.length) return json({ ok: false, error: `missing config: ${missing.join(', ')}` }, 500);

  const key = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '') || url.searchParams.get('key') || '';
  if (!safeEqual(key, env.SETUP_KEY)) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!/^[A-Za-z0-9_-]{16,256}$/.test(env.WEBHOOK_SECRET)) {
    return json({ ok: false, error: 'WEBHOOK_SECRET must be 16-256 chars of A-Z a-z 0-9 _ -' }, 500);
  }

  const webhookUrl = `https://${url.host}/webhook`;
  const result = await setWebhook(env, webhookUrl);
  await setMyCommands(env).catch(() => {});
  return json({ ok: true, webhook: webhookUrl, telegram_result: result });
}
