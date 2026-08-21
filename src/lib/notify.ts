/**
 * Telegram trade notifications & 30-min position heartbeats — server-side only.
 *
 * Secrets are read from environment variables (never shipped to the browser):
 *   TELEGRAM_BOT_TOKEN  — from @BotFather
 *   TELEGRAM_CHAT_ID    — your user/chat id
 */
import type { ClosedTrade, EntryEvent } from "./strategy";

type TgState = { lastOkAt: number | null; lastError: string | null };

const g = globalThis as typeof globalThis & { __vbTg?: TgState };
if (!g.__vbTg) g.__vbTg = { lastOkAt: null, lastError: null };

export function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

export function telegramStatus() {
  return {
    configured: telegramConfigured(),
    lastOkAt: g.__vbTg!.lastOkAt,
    lastError: g.__vbTg!.lastError,
  };
}

async function sendTelegram(text: string): Promise<{ ok: boolean; error: string | null }> {
  if (!telegramConfigured()) return { ok: false, error: "TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set" };
  const token = process.env.TELEGRAM_BOT_TOKEN!;
  const chatId = process.env.TELEGRAM_CHAT_ID!;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const err = `Telegram API ${res.status}: ${body.slice(0, 140)}`;
      g.__vbTg!.lastError = err;
      return { ok: false, error: err };
    }
    g.__vbTg!.lastOkAt = Date.now();
    g.__vbTg!.lastError = null;
    return { ok: true, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "telegram send failed";
    g.__vbTg!.lastError = msg;
    return { ok: false, error: msg };
  }
}

/* ------------------------------------------------------------------ */

const px = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = (n: number) =>
  Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });

export async function notifyEntry(e: EntryEvent, equity: number): Promise<void> {
  const side = e.dir === 1 ? "LONG ▲" : "SHORT ▼";
  const text = [
    `<b>${side} ENTRY</b> — ETHUSDT 2H · <b>${e.regime}</b>`,
    `Filled <b>${px(e.price)}</b> × ${e.qty.toFixed(4)} ETH`,
    `TP <b>${px(e.targetPrice)}</b>  ·  SL <b>${px(e.stopPrice)}</b>`,
    `Risk ${e.effRisk.toFixed(2)}% ($${usd(e.riskCash)}) · ATR r ${e.atrRatio.toFixed(3)}`,
    `Equity ≈ $${usd(equity)}`,
  ].join("\n");
  await sendTelegram(text);
}

const reasonLabel: Record<string, string> = {
  TP: "TP HIT",
  SL: "STOPPED OUT",
  FAIL: "BREAKOUT FAILURE",
  REVERSE: "REVERSED",
  KILL: "KILL SWITCH — 9% DD",
};

export async function notifyExit(t: ClosedTrade, equity: number): Promise<void> {
  const win = t.pnl > 0;
  const side = t.side === "LONG" ? "LONG ▲" : "SHORT ▼";
  const r = Number.isFinite(t.rMultiple) ? ` (${t.rMultiple >= 0 ? "+" : ""}${t.rMultiple.toFixed(2)}R)` : "";
  const text = [
    `<b>${reasonLabel[t.reason] ?? t.reason}</b> — ${side} · <b>${win ? "+" : "−"}$${usd(t.pnl)}${r}</b>`,
    `Exit <b>${px(t.exitPrice)}</b> from ${px(t.entryPrice)} · ${t.qty.toFixed(4)} ETH`,
    `Regime ${t.regime} · net of fees`,
    `Equity $${usd(equity)}`,
  ].join("\n");
  await sendTelegram(text);
}

export type HeartbeatPayload = {
  price: number | null;
  position: {
    dir: 1 | -1;
    qty: number;
    entryPrice: number;
    stopPrice: number;
    targetPrice: number;
    regime: string;
    openPnl: number;
    openPnlPct: number;
  } | null;
  equity: number;
  markedEquity: number;
  peakEquity: number;
  drawdownPct: number;
  market: {
    atrRatio: number;
    band: string;
    expansion: string;
    ema200: number;
    aboveEma: boolean;
  } | null;
  stats: {
    trades: number;
    winRate: number;
    profitFactor: number;
  };
  msToNextClose: number;
};

export async function notifyHeartbeat(d: HeartbeatPayload): Promise<{ ok: boolean; error: string | null }> {
  const p = d.position;
  const price = d.price ?? 0;
  const lines: string[] = [`<b>⏱ ETHUSDT 2H · POSITION UPDATE (30m)</b>\n`];

  if (p) {
    const side = p.dir === 1 ? "LONG ▲" : "SHORT ▼";
    const pnlSign = p.openPnl >= 0 ? "+" : "−";
    const pnlStr = `${pnlSign}$${usd(p.openPnl)} (${p.openPnlPct >= 0 ? "+" : ""}${p.openPnlPct.toFixed(2)}%)`;
    const distTP = price ? (Math.abs(p.targetPrice - price) / price) * 100 : 0;
    const distSL = price ? (Math.abs(p.stopPrice - price) / price) * 100 : 0;
    const riskAtStop = Math.abs(p.entryPrice - p.stopPrice) * p.qty;

    lines.push(
      `<b>${side}</b> · <b>${p.regime}</b> regime`,
      `Filled: <b>${px(p.entryPrice)}</b> × ${p.qty.toFixed(4)} ETH`,
      `Live: <b>${px(price)}</b> · P&L: <b>${pnlStr}</b>\n`,
      `TP: <b>${px(p.targetPrice)}</b> (${distTP.toFixed(2)}% away)`,
      `SL: <b>${px(p.stopPrice)}</b> (${distSL.toFixed(2)}% away)`,
      `Risk at stop: ≈ $${usd(riskAtStop)}\n`
    );
  } else {
    lines.push(
      `<b>Position: FLAT</b> (scanning for expansion)`,
      `Live Price: <b>$${px(price)}</b>\n`
    );
  }

  if (d.market) {
    const trend = d.market.aboveEma ? "ABOVE" : "BELOW";
    lines.push(
      `<b>Tape:</b> ATR ratio <b>${d.market.atrRatio.toFixed(3)}</b> (${d.market.band}) · EMA200 $${px(d.market.ema200)} (${trend})`
    );
  }

  lines.push(
    `<b>Account:</b> Equity <b>$${usd(d.markedEquity)}</b> · DD <b>${d.drawdownPct.toFixed(2)}%</b> (peak $${usd(d.peakEquity)})`,
    `<b>Stats:</b> ${d.stats.trades} trades · ${d.stats.winRate.toFixed(1)}% WR · PF ${d.stats.profitFactor >= 99 ? "∞" : d.stats.profitFactor.toFixed(2)}`
  );

  const minsLeft = Math.max(0, Math.floor(d.msToNextClose / 60000));
  const hrs = Math.floor(minsLeft / 60);
  const mins = minsLeft % 60;
  lines.push(`\n<i>Next 2H bar close in ${hrs}h ${mins}m</i>`);

  return sendTelegram(lines.join("\n"));
}

export async function sendTelegramTest(): Promise<{ ok: boolean; error: string | null }> {
  const text = [
    `<b>VOLBREAK α — alerts connected</b>`,
    `ETHUSDT 2H paper engine will ping this chat on every trade entry and exit (each 2H bar close), plus a position status update every 30 minutes.`,
    `Sound on. Trade well.`,
  ].join("\n");
  return sendTelegram(text);
}
