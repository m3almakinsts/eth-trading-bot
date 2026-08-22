/**
 * Paper-trading engine orchestrator.
 *
 * Lazily advances the strategy: every dashboard poll triggers `tick()`,
 * which pulls the latest ETHUSDT 2H klines from Binance and replays any
 * candles that closed since the last run through the v3.3c engine. On the
 * first start it replays the full 1000-candle window (~83 days) so the
 * dashboard immediately shows a rich paper history; every subsequent bar
 * is processed "live" as Binance closes it.
 */
import { db, initDbTables } from "@/db";
import { botState, trades, equitySnapshots } from "@/db/schema";
import { asc, desc, eq } from "drizzle-orm";
import {
  CFG,
  buildSeries,
  runBars,
  summarizeMarket,
  type Candle,
  type EngineState,
  type MarketSummary,
  type Snapshot,
} from "./strategy";
import { fetchKlines, fetchKlinesHistory, fetchTicker } from "./binance";
import { notifyEntry, notifyExit, notifyHeartbeat, sendTelegram, telegramStatus } from "./notify";

type StateRow = typeof botState.$inferSelect;
type TradeRow = typeof trades.$inferSelect;

/* ------------------------------------------------------------------ */
/* State helpers                                                       */
/* ------------------------------------------------------------------ */

async function ensureState(): Promise<StateRow> {
  await initDbTables();
  const rows = await db.select().from(botState).where(eq(botState.id, 1)).limit(1);
  if (rows.length > 0) {
    // Keep the in-memory cadence in sync with the persisted setting on boot.
    const m = rows[0].heartbeatMins;
    if (typeof m === "number" && m >= 0) applyHeartbeatMins(m);
    return rows[0];
  }
  const inserted = await db
    .insert(botState)
    .values({ id: 1, updatedAt: Date.now() })
    .returning();
  return inserted[0] as StateRow;
}

function toEngineState(row: StateRow, timeToIdx: Map<number, number>): EngineState {
  return {
    equity: row.equity,
    peakEquity: row.peakEquity,
    lossStreak: row.lossStreak,
    lastExitIdx:
      row.lastExitTime !== null && timeToIdx.has(row.lastExitTime)
        ? timeToIdx.get(row.lastExitTime)!
        : null,
    lastExitDir: (row.lastExitDir as 0 | 1 | -1) ?? 0,
    lastExitWasTP: row.lastExitWasTP,
    killSwitch: row.killSwitch,
    isRunning: row.isRunning,
    pos:
      row.posDir !== 0 &&
      row.posEntryPrice !== null &&
      row.posEntryTime !== null &&
      timeToIdx.has(row.posEntryTime)
        ? {
            dir: row.posDir as 1 | -1,
            qty: row.posQty,
            entryPrice: row.posEntryPrice,
            entryIdx: timeToIdx.get(row.posEntryTime)!,
            entryTime: row.posEntryTime,
            atr: row.posATR ?? 0,
            stopPrice: row.posStopPrice ?? 0,
            targetPrice: row.posTargetPrice ?? 0,
            brkLevel: row.posBrkLevel ?? NaN,
            regime: (row.posRegime as "STRONG" | "MEDIUM" | "QUIET" | "CONTINUATION") ?? "QUIET",
            atrRatio: 0,
            effRisk: 0,
            entryCommission: row.posEntryCommission ?? 0,
          }
        : null,
    rollWindow: [],
  };
}

/* ------------------------------------------------------------------ */
/* Tick                                                                */
/* ------------------------------------------------------------------ */

type TickInfo = {
  closed: Candle[];
  forming: Candle | null;
  market: MarketSummary | null;
  processedBars: number;
  newTrades: number;
  bootstrap: boolean;
};

async function tick(): Promise<TickInfo> {
  const preRow = await ensureState();
  const willBootstrap =
    preRow.lastProcessedTime === null && preRow.isRunning && !preRow.killSwitch;

  // Bootstrap replays ~2 years of 2H history; steady state pulls just the tail.
  const all = willBootstrap ? await fetchKlinesHistory(2) : await fetchKlines(1000, false);
  const forming = all.length > 0 && all[all.length - 1].t + CFG.intervalMs > Date.now()
    ? all[all.length - 1]
    : null;
  const closed = forming ? all.slice(0, -1) : all;

  const series = buildSeries(closed);
  const market = summarizeMarket(closed, series);

  let row = await ensureState();
  const info: TickInfo = { closed, forming, market, processedBars: 0, newTrades: 0, bootstrap: false };

  if (!row.isRunning || row.killSwitch) return info;

  const timeToIdx = new Map<number, number>();
  closed.forEach((c, i) => timeToIdx.set(c.t, i));

  let fromIdx: number | null = null;
  let bootstrap = false;
  if (row.lastProcessedTime === null) {
    fromIdx = CFG.minBars; // replay the whole fetched window as paper history
    bootstrap = true;
  } else {
    const known = timeToIdx.get(row.lastProcessedTime);
    fromIdx = known !== undefined ? known + 1 : null;
    if (fromIdx !== null && fromIdx > closed.length - 1) return info; // nothing new
  }

  info.bootstrap = bootstrap;
  const st = toEngineState(row, timeToIdx);

  // Rolling loss window from the trade ledger
  const recent = await db
    .select({ pnl: trades.pnl })
    .from(trades)
    .orderBy(desc(trades.id))
    .limit(CFG.rollK);
  st.rollWindow = recent.map((r) => r.pnl <= 0).reverse();

  const res = runBars(closed, series, st, fromIdx ?? closed.length, closed.length - 1);
  info.processedBars = res.snapshots.length;
  info.newTrades = res.trades.length;

  if (res.lastProcessedIdx === null) return info;

  // Persist new trades
  if (res.trades.length > 0) {
    await db.insert(trades).values(
      res.trades.map((t) => ({
        side: t.side,
        regime: t.regime,
        qty: t.qty,
        entryPrice: t.entryPrice,
        exitPrice: t.exitPrice,
        entryTime: t.entryTime,
        exitTime: t.exitTime,
        pnl: t.pnl,
        commission: t.commission,
        rMultiple: Number.isFinite(t.rMultiple) ? t.rMultiple : null,
        reason: t.reason,
        atrRatio: Number.isFinite(t.atrRatio) ? t.atrRatio : null,
        effRisk: Number.isFinite(t.effRisk) ? t.effRisk : null,
        origin: bootstrap ? "REPLAY" : "LIVE",
      }))
    );
  }

  // Persist equity curve (chunked, idempotent on candle time)
  if (res.snapshots.length > 0) {
    const CHUNK = 250;
    for (let i = 0; i < res.snapshots.length; i += CHUNK) {
      await db
        .insert(equitySnapshots)
        .values(
          res.snapshots.slice(i, i + CHUNK).map((s) => ({
            time: s.t,
            equity: s.equity,
            posDir: s.posDir,
          }))
        )
        .onConflictDoNothing({ target: equitySnapshots.time });
    }
  }

  // Persist engine state
  const lastExit = res.trades.length > 0 ? res.trades[res.trades.length - 1] : null;
  const patch: Record<string, unknown> = {
    isRunning: st.isRunning,
    killSwitch: st.killSwitch,
    equity: st.equity,
    peakEquity: st.peakEquity,
    lossStreak: st.lossStreak,
    lastProcessedTime: closed[res.lastProcessedIdx].t,
    updatedAt: Date.now(),
    posDir: st.pos ? st.pos.dir : 0,
    posQty: st.pos ? st.pos.qty : 0,
    posEntryPrice: st.pos ? st.pos.entryPrice : null,
    posEntryTime: st.pos ? st.pos.entryTime : null,
    posATR: st.pos ? st.pos.atr : null,
    posStopPrice: st.pos ? st.pos.stopPrice : null,
    posTargetPrice: st.pos ? st.pos.targetPrice : null,
    posBrkLevel: st.pos ? st.pos.brkLevel : null,
    posRegime: st.pos ? st.pos.regime : null,
    posEntryCommission: st.pos ? st.pos.entryCommission : null,
  };
  if (st.lastExitIdx !== null && (lastExit || row.lastExitTime === null)) {
    patch.lastExitTime = lastExit
      ? lastExit.exitTime
      : row.lastExitTime;
    patch.lastExitDir = st.lastExitDir;
    patch.lastExitWasTP = st.lastExitWasTP;
  } else {
    patch.lastExitDir = st.lastExitDir;
    patch.lastExitWasTP = st.lastExitWasTP;
  }

  await db.update(botState).set(patch).where(eq(botState.id, 1));

  // Telegram alerts — only for LIVE bars. The multi-year bootstrap replay is
  // deliberately silent so a fresh START never spams the phone.
  if (!bootstrap && (res.entries.length > 0 || res.trades.length > 0)) {
    const events: Array<{ kind: "entry" | "exit"; time: number; i: number }> = [
      ...res.entries.map((_, i) => ({ kind: "entry" as const, time: res.entries[i].time, i })),
      ...res.trades.map((_, i) => ({ kind: "exit" as const, time: res.trades[i].exitTime, i })),
    ];
    events.sort((a, b) => (a.time - b.time) || (a.kind === "exit" ? -1 : 1));
    for (const ev of events) {
      if (ev.kind === "entry") await notifyEntry(res.entries[ev.i], st.equity);
      else await notifyExit(res.trades[ev.i], st.equity);
    }
  }

  return info;
}

/* ------------------------------------------------------------------ */
/* Control actions                                                     */
/* ------------------------------------------------------------------ */

export async function control(action: "start" | "pause" | "reset") {
  const row = await ensureState();
  if (action === "start") {
    await db
      .update(botState)
      .set({ isRunning: true, killSwitch: false, updatedAt: Date.now() })
      .where(eq(botState.id, 1));
  } else if (action === "pause") {
    await db
      .update(botState)
      .set({ isRunning: false, updatedAt: Date.now() })
      .where(eq(botState.id, 1));
  } else if (action === "reset") {
    await db.delete(trades);
    await db.delete(equitySnapshots);
    await db
      .update(botState)
      .set({
        isRunning: false,
        killSwitch: false,
        equity: CFG.initialCapital,
        initialCapital: CFG.initialCapital,
        peakEquity: CFG.initialCapital,
        lossStreak: 0,
        lastExitTime: null,
        lastExitDir: 0,
        lastExitWasTP: false,
        lastProcessedTime: null,
        posDir: 0,
        posQty: 0,
        posEntryPrice: null,
        posEntryTime: null,
        posATR: null,
        posStopPrice: null,
        posTargetPrice: null,
        posBrkLevel: null,
        posRegime: null,
        posEntryCommission: null,
        updatedAt: Date.now(),
      })
      .where(eq(botState.id, 1));
  }
  void row;
}

/* ------------------------------------------------------------------ */
/* Dashboard assembly                                                  */
/* ------------------------------------------------------------------ */

export type PositionView = {
  dir: 1 | -1;
  qty: number;
  entryPrice: number;
  entryTime: number;
  stopPrice: number;
  targetPrice: number;
  atr: number;
  regime: string;
  openPnl: number;
  openPnlPct: number;
};

export type Stats = {
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  profitFactor: number;
  netPnl: number;
  netPnlPct: number;
  maxDrawdownPct: number;
  avgR: number;
  openExposure: number;
};

function num(v: number | null | undefined): number | null {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  return v;
}

export type TradeView = {
  id: number;
  side: string;
  regime: string;
  qty: number;
  entryPrice: number;
  exitPrice: number;
  entryTime: number;
  exitTime: number;
  pnl: number;
  rMultiple: number | null;
  reason: string;
  atrRatio: number | null;
  effRisk: number | null;
  origin: string;
};

export type DashboardPayload = {
  ok: boolean;
  error: string | null;
  serverTime: number;
  running: boolean;
  autopilot: { active: boolean; wakes: number; lastWake: number | null };
  heartbeat: {
    lastAt: number | null;
    nextAt: number | null;
    intervalMs: number;
    mins: number;
  };
  telegram: {
    configured: boolean;
    lastOkAt: number | null;
    lastError: string | null;
    lastHeartbeatAt: number | null;
    heartbeatsSent: number;
  };
  killSwitch: boolean;
  neverRan: boolean;
  bootstrap: boolean;
  equity: number;
  markedEquity: number;
  peakEquity: number;
  drawdownPct: number;
  lossStreak: number;
  riskNow: number;
  rollLosses: number;
  position: PositionView | null;
  price: number | null;
  ticker: { changePct: number; high: number; low: number; volume: number } | null;
  market: MarketSummary | null;
  candles: Candle[];
  stats: Stats;
  equityCurve: Snapshot[];
  trades: TradeView[];
  lastProcessedTime: number | null;
};

let tickChain: Promise<void> = Promise.resolve();
let lastTickInfo: { processedBars: number; newTrades: number; bootstrap: boolean } = {
  processedBars: 0,
  newTrades: 0,
  bootstrap: false,
};
let lastTickError: string | null = null;

function guardedTick(): Promise<void> {
  tickChain = tickChain
    .then(async () => {
      try {
        const info = await tick();
        lastTickInfo = {
          processedBars: info.processedBars,
          newTrades: info.newTrades,
          bootstrap: info.bootstrap,
        };
        lastTickError = null;
        dashboardCache.candles = [...info.closed.slice(-280)];
        if (info.forming) dashboardCache.candles.push(info.forming);
        dashboardCache.market = info.market;
      } catch (err) {
        lastTickError = err instanceof Error ? err.message : "tick failed";
        try {
          const all = await fetchKlines(300, false);
          dashboardCache.candles = all;
        } catch {
          /* keep stale */
        }
      }
    })
    .catch(() => undefined);
  return tickChain;
}

const dashboardCache: { candles: Candle[]; market: MarketSummary | null } = {
  candles: [],
  market: null,
};

/* ------------------------------------------------------------------ */
/* Server autopilot entry point                                        */
/* ------------------------------------------------------------------ */

type AutopilotWake = { wakes: number; lastWake: number };

function autopilotWake(): AutopilotWake | null {
  const g = globalThis as typeof globalThis & {
    __vbAutopilot?: unknown;
    __vbAutopilotWake?: AutopilotWake;
  };
  return g.__vbAutopilotWake ?? null;
}

/** Telegram heartbeat schedule, read from autopilot process state. */
export const DEFAULT_HEARTBEAT_MINS = 30;
export const HEARTBEAT_MIN_BOUND = 1;
export const HEARTBEAT_MAX_BOUND = 240;

type HeartbeatGlobals = {
  __vbLastHeartbeat?: number;
  __vbBootAt?: number;
  __vbHeartbeatMins?: number;
};

const hbGlobal = () => globalThis as typeof globalThis & HeartbeatGlobals;

/** Effective cadence in minutes (0 = disabled). Kept hot so the timer needs no DB read. */
export function getHeartbeatMins(): number {
  const v = hbGlobal().__vbHeartbeatMins;
  return typeof v === "number" && v >= 0 ? v : DEFAULT_HEARTBEAT_MINS;
}

export function applyHeartbeatMins(mins: number): void {
  hbGlobal().__vbHeartbeatMins = Math.max(0, Math.round(mins));
}

export function heartbeatSchedule(): {
  lastAt: number | null;
  nextAt: number | null;
  intervalMs: number;
  mins: number;
} {
  const g = hbGlobal();
  const mins = getHeartbeatMins();
  const intervalMs = mins * 60_000;
  // Fall back to boot time so the countdown is meaningful before the first ping.
  const anchor =
    g.__vbLastHeartbeat && g.__vbLastHeartbeat > 0 ? g.__vbLastHeartbeat : g.__vbBootAt ?? 0;
  if (!anchor || mins <= 0) {
    return { lastAt: anchor || null, nextAt: null, intervalMs, mins };
  }
  return { lastAt: anchor, nextAt: anchor + intervalMs, intervalMs, mins };
}

/** Persist a new cadence (0 disables heartbeats) and apply it immediately. */
export async function setHeartbeatMins(mins: number): Promise<number> {
  const clamped = Math.min(
    HEARTBEAT_MAX_BOUND,
    Math.max(0, Math.round(Number.isFinite(mins) ? mins : DEFAULT_HEARTBEAT_MINS))
  );
  await initDbTables();
  await db.update(botState).set({ heartbeatMins: clamped }).where(eq(botState.id, 1));
  applyHeartbeatMins(clamped);
  // Restart the countdown so the new cadence takes effect right away.
  hbGlobal().__vbLastHeartbeat = Date.now();
  return clamped;
}

/**
 * Called by the server-side scheduler (and once at boot). Cheaply wakes,
 * and only pulls market data + advances the engine when a new 2H candle
 * has actually closed since the last processed bar. Never throws.
 */
export async function tickIfNeeded(force = false): Promise<void> {
  try {
    const wake = autopilotWake();
    if (wake) {
      wake.wakes += 1;
      wake.lastWake = Date.now();
    }

    const now = Date.now();
    const lastClosedOpen =
      Math.floor(now / CFG.intervalMs) * CFG.intervalMs - CFG.intervalMs;

    // Give Binance a few seconds to settle the just-closed candle.
    if (!force && now - (lastClosedOpen + CFG.intervalMs) < 12_000) return;

    const row = await ensureState();
    if (!row.isRunning || row.killSwitch) return;
    if (
      !force &&
      row.lastProcessedTime !== null &&
      row.lastProcessedTime >= lastClosedOpen
    ) {
      return;
    }

    await guardedTick();
  } catch {
    /* the autopilot must never take the server down */
  }
}

export async function getDashboard(): Promise<DashboardPayload> {
  await guardedTick();

  const row = await ensureState();
  const recentTrades = await db
    .select()
    .from(trades)
    .orderBy(desc(trades.id))
    .limit(600);

  const allForStats = await db
    .select({ pnl: trades.pnl, rMultiple: trades.rMultiple })
    .from(trades);

  const curveRows = await db
    .select({ time: equitySnapshots.time, equity: equitySnapshots.equity, posDir: equitySnapshots.posDir })
    .from(equitySnapshots)
    .orderBy(asc(equitySnapshots.time));

  const livePrice = dashboardCache.candles.length
    ? dashboardCache.candles[dashboardCache.candles.length - 1].c
    : null;

  const ticker = await fetchTicker();

  const hasPos =
    row.posDir !== 0 &&
    row.posEntryPrice !== null &&
    row.posStopPrice !== null &&
    row.posTargetPrice !== null;

  const openPnl = hasPos && livePrice !== null
    ? (livePrice - row.posEntryPrice!) * row.posQty * row.posDir
    : 0;

  const markedEquity = row.equity + openPnl;
  const drawdownPct =
    row.peakEquity > 0 ? ((row.peakEquity - markedEquity) / row.peakEquity) * 100 : 0;

  // ---- stats
  let wins = 0, losses = 0, grossP = 0, grossL = 0, rSum = 0, rCount = 0;
  for (const t of allForStats) {
    if (t.pnl > 0) { wins++; grossP += t.pnl; }
    else { losses++; grossL += Math.abs(t.pnl); }
    if (t.rMultiple !== null && Number.isFinite(t.rMultiple)) { rSum += t.rMultiple; rCount++; }
  }
  const total = allForStats.length;
  const netPnl = grossP - grossL;

  let maxDD = 0;
  let peak = -Infinity;
  for (const s of curveRows) {
    peak = Math.max(peak, s.equity);
    if (peak > 0) maxDD = Math.max(maxDD, ((peak - s.equity) / peak) * 100);
  }

  // Downsample the curve payload for the chart (max drawdown above keeps
  // full resolution regardless of sampling).
  const MAX_CURVE_PTS = 1600;
  const stride = Math.max(1, Math.ceil(curveRows.length / MAX_CURVE_PTS));
  const sampledCurve = curveRows.filter(
    (_, i) => i % stride === 0 || i === curveRows.length - 1
  );

  const stats: Stats = {
    trades: total,
    wins,
    losses,
    winRate: total > 0 ? (wins / total) * 100 : 0,
    profitFactor: grossL > 0 ? grossP / grossL : grossP > 0 ? 99 : 0,
    netPnl,
    netPnlPct: (netPnl / CFG.initialCapital) * 100,
    maxDrawdownPct: maxDD,
    avgR: rCount > 0 ? rSum / rCount : 0,
    openExposure: hasPos && livePrice ? row.posQty * livePrice : 0,
  };

  // ---- live risk preview: effRisk for the next trade at current state
  const rollLosses = recentTrades.slice(0, CFG.rollK).filter((t) => t.pnl <= 0).length;
  let riskNow: number = CFG.riskPctBase;
  if (row.equity < row.peakEquity) riskNow *= CFG.underwaterMult;
  if (row.lossStreak > 0)
    riskNow *= Math.pow(CFG.streakCut, Math.min(row.lossStreak, CFG.streakMax));
  if (rollLosses > 0)
    riskNow *= Math.pow(CFG.rollCut, Math.min(rollLosses, CFG.rollMax));
  const atrNow = dashboardCache.market?.atrRatio;
  if (atrNow !== undefined && Number.isFinite(atrNow))
    riskNow *= atrNow <= 1.08 ? CFG.wQuiet : atrNow <= 1.17 ? CFG.wMid : CFG.wHot;
  riskNow = Math.min(CFG.riskMax, Math.max(CFG.riskMin, riskNow));

  const position: PositionView | null = hasPos
    ? {
        dir: row.posDir as 1 | -1,
        qty: row.posQty,
        entryPrice: row.posEntryPrice!,
        entryTime: row.posEntryTime!,
        stopPrice: row.posStopPrice!,
        targetPrice: row.posTargetPrice!,
        atr: row.posATR ?? 0,
        regime: row.posRegime ?? "—",
        openPnl,
        openPnlPct: row.equity > 0 ? (openPnl / row.equity) * 100 : 0,
      }
    : null;

  const g = globalThis as typeof globalThis & { __vbAutopilot?: unknown };
  const wake = autopilotWake();

  return {
    ok: lastTickError === null,
    error: lastTickError,
    serverTime: Date.now(),
    running: row.isRunning,
    autopilot: {
      active: Boolean(g.__vbAutopilot),
      wakes: wake?.wakes ?? 0,
      lastWake: wake && wake.lastWake > 0 ? wake.lastWake : null,
    },
    heartbeat: heartbeatSchedule(),
    telegram: telegramStatus(),
    killSwitch: row.killSwitch,
    neverRan: row.lastProcessedTime === null,
    bootstrap: lastTickInfo.bootstrap && lastTickInfo.processedBars > 0,
    equity: row.equity,
    markedEquity,
    peakEquity: row.peakEquity,
    drawdownPct,
    lossStreak: row.lossStreak,
    riskNow,
    rollLosses,
    position,
    price: livePrice,
    ticker: ticker
      ? { changePct: ticker.changePct, high: ticker.high, low: ticker.low, volume: ticker.volume }
      : null,
    market: dashboardCache.market,
    candles: dashboardCache.candles,
    stats,
    equityCurve: sampledCurve.map((r) => ({ t: r.time, equity: r.equity, posDir: r.posDir })),
    trades: recentTrades.map((t: TradeRow) => ({
      id: t.id,
      side: t.side,
      regime: t.regime,
      qty: t.qty,
      entryPrice: t.entryPrice,
      exitPrice: t.exitPrice,
      entryTime: t.entryTime,
      exitTime: t.exitTime,
      pnl: t.pnl,
      rMultiple: num(t.rMultiple),
      reason: t.reason,
      atrRatio: num(t.atrRatio),
      effRisk: num(t.effRisk),
      origin: t.origin,
    })),
    lastProcessedTime: row.lastProcessedTime,
  };
}

/**
 * Compiles current position state, live price, tape regime, and account stats,
 * and sends a 30-min heartbeat message to Telegram.
 */
export async function sendHeartbeat(): Promise<{ ok: boolean; error: string | null }> {
  let d: DashboardPayload;
  try {
    d = await getDashboard();
  } catch {
    // Market feed or DB hiccup — still prove the autopilot is alive.
    return sendTelegram(`⏱ <b>VOLBREAK α · keep-alive</b>\nAutopilot running, but market data is unreachable right now. Retrying on the next 2H bar.`);
  }

  try {
    if (!d.running && !d.killSwitch) {
      return { ok: false, error: "Engine not running" };
    }

    const now = Date.now();
    const nextClose = Math.floor(now / CFG.intervalMs) * CFG.intervalMs + CFG.intervalMs;
    const msToNextClose = Math.max(0, nextClose - now);

    return await notifyHeartbeat({
      price: d.price,
      position: d.position,
      equity: d.equity,
      markedEquity: d.markedEquity,
      peakEquity: d.peakEquity,
      drawdownPct: d.drawdownPct,
      market: d.market
        ? {
            atrRatio: d.market.atrRatio,
            band: d.market.band,
            expansion: d.market.expansion,
            ema200: d.market.ema200,
            aboveEma: d.market.aboveEma,
          }
        : null,
      stats: {
        trades: d.stats.trades,
        winRate: d.stats.winRate,
        profitFactor: d.stats.profitFactor,
      },
      msToNextClose,
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "heartbeat failed",
    };
  }
}