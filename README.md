# VOLBREAK α — ETHUSDT 2H Adaptive Volatility Breakout (Paper Bot)

A Next.js + PostgreSQL paper-trading terminal that runs the v3.3c Adaptive
Volatility Breakout strategy against live Binance ETHUSDT 2-hour candles using
$100,000 of virtual money, and pushes Telegram alerts to your phone.

- Entry / exit Telegram alerts on every trade
- **30-minute position heartbeat** to Telegram
- 24/7 server-side autopilot (runs with every browser tab closed)
- 2 years of replayed trade history, equity curve, live chart

---

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string. On Render use the **Internal Database URL**. |
| `TELEGRAM_BOT_TOKEN` | for alerts | Token from Telegram's @BotFather. |
| `TELEGRAM_CHAT_ID` | for alerts | Your user/chat id (group ids start with `-100`). |

Server-side only — none of these are exposed to the browser.

---

## Deploying to Render

1. Create a **PostgreSQL** instance, copy its **Internal Database URL**.
2. Create a **Web Service** from your GitHub repo:
   - Build command: `npm install && npm run build`
   - Start command: `npm run start`
3. Add the three environment variables above.
4. Deploy. Tables are created automatically on first boot — no migration step.

---

## ⚠️ IMPORTANT: keeping the free tier awake

**Render's free web services are suspended after ~15 minutes with no inbound
HTTP traffic.** A suspended Node process cannot run timers, so the autopilot
and the 30-minute heartbeat stop firing.

### Fix — add a free uptime pinger (2 minutes, once)

Use [UptimeRobot](https://uptimerobot.com) or [cron-job.org](https://cron-job.org):

1. Create a new monitor:
   - **Monitor type:** HTTP(s)
   - **URL:** `https://YOUR-APP.onrender.com/api/ping`
   - **Interval:** every **10 minutes** (must be under 15)
2. Save. Done.

`/api/ping` is deliberately cheap — it returns immediately without touching the
database — and each hit also nudges the strategy engine, so the bot advances
even if the internal timer were ever lost.

### Alternatives

- **Render Starter plan (~$7/mo)** — instances never sleep; no pinger needed.
- **A small VPS** (Hetzner ~€4/mo) — run `npm run start` under a process
  manager such as `pm2` or `systemd`.

---

## Verifying it works

| Check | Where |
| --- | --- |
| Service healthy | `GET /api/health` |
| Engine + Telegram status | `GET /api/state` (`running`, `autopilot.active`, `telegram.*`) |
| Send a test alert | `POST /api/notify/test` |
| Send a heartbeat now | `POST /api/notify/heartbeat` |

In the dashboard header, the **30m ping** chip shows the timestamp of the most
recent heartbeat. If that timestamp stops advancing, the instance has gone to
sleep — check the pinger.

---

## Strategy reference

| Parameter | Value |
| --- | --- |
| Symbol / timeframe | ETHUSDT / 2H |
| Regime channels | 15 / 60 / 80 bars (ATR ratio > 1.10 / 1.05 / 1.02) |
| TP · SL | 1.48 × 4.0 ATR (strong), 0.8 × 4.6 ATR (other) |
| Risk band | 1.00–2.00% of equity per trade |
| Leverage cap | 2.0× notional |
| Commission / slippage | 0.05% per side / 10 ticks |
| Kill switch | 9.0% drawdown from peak equity |

Educational paper-trading software. Not financial advice.
