# StatPulse — Beta

Telegram bot on **Cloudflare Workers + D1**, webhook-based, free-plan compatible. No server, VPS or polling — your phone/computer does not need to stay online.

It analyses **its own usage** (commands, button taps, message counts per user). Message text is never stored.

## Features

| Menu button | What it does (all figures come from stored D1 data) |
|---|---|
| 📊 Dashboard | Users, requests processed, active users (24 h / 7 d), stored activity entries, last sync, system status |
| 📈 Live Statistics | Configurable live window, 12-hour sparkline, today/7-day/30-day vs previous period (% change), same-weekday average, peak day |
| 👥 Users | Own profile. **Admins:** paginated user list, profiles, block/unblock, per-user history |
| 📋 Activity History | Own request history (paged). **Admins:** global feed |
| 📉 Analytics | 14-day trend, anomaly detection (z-score vs prior 14 days), action/type percentages |
| 🔔 Notifications | Toggle activity digest/alerts, system status, announcements |
| ⚙️ Settings | Language (EN/RU/FA), notifications, live window, reset preferences |
| ℹ️ About | Version and data policy |

**Admin commands:** `/announce <text>`, `/sysnotice <text>`, `/user <id>`, `/ban <id>`, `/unban <id>`, `/admins`, `/addadmin <id>` and `/rmadmin <id>` (owners only).

**Automatic notifications (cron):** daily summary with anomaly flag (~00:00 UTC, to opted-in users) and a webhook-error alert to admins.

### Honest notes
- Percentages show **"n/a"** when there is no full previous period of stored history. Nothing is invented or predicted. Anomaly = |z| ≥ 2 and ≥ 5 requests away from the prior-14-day mean, and needs ≥ 5 days of history.
- **External API integrations: none required.** Importing outside data (website/app analytics, payments etc.) is not included and would need an ingestion endpoint plus that provider's API.
- Free plan limits drive the design: broadcasts go through an `outbox` table drained by cron (~30 messages/min, under the 50-subrequest limit); activity logs are pruned after 90 days (daily roll-ups in `statistics` are kept).
- Admin identity = numeric Telegram ID (never username). Owners come from the `ADMIN_IDS` secret.

## Layout
```
wrangler.toml            migrations/0001_init.sql
src/index.js             webhook, /register, /health, cron entry
src/telegram.js          Bot API client
src/handlers/            router + one file per menu section + admin commands
src/keyboards/           inline keyboards
src/database/queries.js  all SQL (parameterized)
src/services/            analytics, outbox, cron, rate limit
src/utils/               i18n, formatting, validation
```
Tables: `users, activity_logs, statistics, user_settings, admin_users` + support tables `processed_updates` (duplicate protection), `rate_limits`, `outbox`, `kv`.

## Deploy (step by step)

Requires a Cloudflare account (free) and Node.js 18+ on a computer for the one-time setup.

1. **Create the bot:** in Telegram open @BotFather → `/newbot` → copy the token. Get your numeric ID from @userinfobot.
2. **Install:** `npm install` and `npx wrangler login`
3. **Create the database:** `npx wrangler d1 create statpulse-db` → copy the printed `database_id` into `wrangler.toml`.
4. **Apply migrations:** `npm run db:migrate`
5. **Deploy:** `npm run deploy` → note the URL, e.g. `https://statpulse-bot.<you>.workers.dev`
6. **Set secrets** (each command prompts for the value):
   ```
   npx wrangler secret put BOT_TOKEN        # from BotFather
   npx wrangler secret put WEBHOOK_SECRET   # random, 16-64 chars of A-Z a-z 0-9 _ -
   npx wrangler secret put SETUP_KEY        # random, protects /register
   npx wrangler secret put ADMIN_IDS        # e.g. 123456789 (comma-separate several)
   ```
   Generate random values: `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`
7. **Register the webhook:**
   ```
   curl -X POST https://<your-worker-url>/register -H "Authorization: Bearer <SETUP_KEY>"
   ```
   (or open `https://<your-worker-url>/register?key=<SETUP_KEY>` in a browser). Expect `"ok": true`.
8. Open your bot in Telegram and send `/start`.

**Without a computer:** push this folder to a GitHub repo, then Cloudflare dashboard → *Workers & Pages → Create → Import a repository*. Create the D1 database in *Storage & Databases → D1*, paste `migrations/0001_init.sql` into its **Console**, bind it as `DB`, add the four secrets under *Settings → Variables and Secrets*, and open the `/register` URL in your phone browser.

## Test the deployed bot
1. `https://<worker>/health` → `{"ok":true}`.
2. `/start` shows the 8-button menu; tap every button and use ◀️ Menu / 🔄 Refresh.
3. As owner: Users → open a profile; `/admins` lists your ID. Second Telegram account: `/start`, confirm `/ban` and `/announce` answer "Admins only".
4. Settings: switch language and live window; Notifications: toggle each switch.
5. `/announce test` → arrives within ~1 minute on a second account.
6. Wait ≥ 5 min → Dashboard shows a *Last sync* time and ✅ Operational.
7. Live logs: `npx wrangler tail`. Telegram side: `https://api.telegram.org/bot<TOKEN>/getWebhookInfo` (no `last_error_message`).
8. Statistics need history: percentages vs previous periods appear after 2 / 14 / 60 days of data, anomaly detection after 5 days.

## Troubleshooting
- Bot silent: check `getWebhookInfo`; 403 means `WEBHOOK_SECRET` differs from the one used at `/register` — re-run `/register` after changing it.
- `missing config: ...` JSON: a secret is not set.
- `/register` 401: wrong `SETUP_KEY`.
- To add a language, add a dictionary in `src/utils/i18n.js` (key set must match `en`) and register it in `LANGS`.
