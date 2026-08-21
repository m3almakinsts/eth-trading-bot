/**
 * ETHUSDT 2H Adaptive Volatility Breakout v3.3c — TypeScript engine.
 *
 * A bar-by-bar port of the Pine Script strategy:
 *  - ATR-expansion regimes (strong / medium / quiet) traded as breakouts of
 *    15 / 60 / 80-bar channels (evaluated on confirmed 2H closes)
 *  - Volume participation + EMA-200 trend filters
 *  - ATR-based TP/SL (4.0/1.48 strong, 4.6/0.8 otherwise) in mintick steps
 *  - Breakout-failure early exit (3.5 ATR beyond broken level, 4-bar grace)
 *  - Continuation re-entry (8-bar breakout within 24 bars after a winner)
 *  - Smart sizing: base 6% risk throttled by underwater / loss-streak /
 *    rolling-loss / regime weights, clamped to a hard 1–2 % band of equity
 *  - 2.0x notional leverage cap, 0.05% commission, 10-tick slippage
 *  - 9% max-drawdown kill switch (strategy.risk.max_drawdown)
 */

export type Candle = {
  t: number; // open time ms (UTC)
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
};

export const CFG = {
  symbol: "ETHUSDT",
  interval: "2h",
  intervalMs: 2 * 60 * 60 * 1000,
  initialCapital: 100000,

  strongLookback: 15,
  mediumLookback: 60,
  quietLookback: 80,
  atrFastLen: 14,
  atrSlowLen: 28,

  strongExpansion: 1.1,
  mediumExpansion: 1.05,
  quietExpansion: 1.02,

  volumeLen: 30,
  volumeRatio: 0.5,

  strongStopATR: 4.0,
  strongTargetATR: 1.48,
  normalStopATR: 4.6,
  normalTargetATR: 0.8,

  trendLen: 200,
  failATR: 3.5,
  failGrace: 4,
  contLookback: 8,
  contWindow: 24,

  riskPctBase: 6.0,
  riskMin: 1.0,
  riskMax: 2.0,
  underwaterMult: 0.55,
  streakCut: 0.7,
  streakMax: 3,
  rollK: 8,
  rollCut: 0.9,
  rollMax: 4,
  wQuiet: 0.8, // atrRatio <= 1.08
  wMid: 1.1, // atrRatio <= 1.17
  wHot: 0.6, // atrRatio > 1.17

  leverageCap: 2.0,
  commission: 0.0005, // 0.05% per side
  slippageTicks: 10,
  mintick: 0.01,
  maxDrawdownPct: 9.0,

  minBars: 300, // EMA-200 warm-up before trading
} as const;

export const SLIP = CFG.slippageTicks * CFG.mintick; // 0.10 USDT

export type Position = {
  dir: 1 | -1;
  qty: number;
  entryPrice: number;
  entryIdx: number;
  entryTime: number; // candle open time of fill bar
  atr: number;
  stopPrice: number;
  targetPrice: number;
  brkLevel: number;
  regime: "STRONG" | "MEDIUM" | "QUIET" | "CONTINUATION";
  atrRatio: number;
  effRisk: number;
  entryCommission: number;
};

export type EngineState = {
  equity: number; // realized cash equity (position value NOT included)
  peakEquity: number;
  lossStreak: number;
  lastExitIdx: number | null;
  lastExitDir: 0 | 1 | -1;
  lastExitWasTP: boolean;
  killSwitch: boolean;
  isRunning: boolean;
  pos: Position | null;
  rollWindow: boolean[]; // chronological, true = losing trade, capped at rollK
};

export type ClosedTrade = {
  side: "LONG" | "SHORT";
  regime: string;
  qty: number;
  entryPrice: number;
  exitPrice: number;
  entryTime: number;
  exitTime: number;
  pnl: number;
  commission: number;
  rMultiple: number;
  reason: "TP" | "SL" | "FAIL" | "REVERSE" | "KILL";
  atrRatio: number;
  effRisk: number;
};

export type Snapshot = { t: number; equity: number; posDir: number };

export type EntryEvent = {
  dir: 1 | -1;
  price: number;
  qty: number;
  stopPrice: number;
  targetPrice: number;
  regime: string;
  effRisk: number;
  riskCash: number;
  atrRatio: number;
  time: number;
};

export type BarsResult = {
  trades: ClosedTrade[];
  entries: EntryEvent[];
  snapshots: Snapshot[];
  lastProcessedIdx: number | null;
  killed: boolean;
};

/* ------------------------------------------------------------------ */
/* Indicators (TradingView-compatible)                                 */
/* ------------------------------------------------------------------ */

export type Series = {
  atrF: number[];
  atrS: number[];
  ema: number[];
  volMA: number[];
  hhStrong: number[];
  llStrong: number[];
  hhMed: number[];
  llMed: number[];
  hhQuiet: number[];
  llQuiet: number[];
  hhCont: number[];
  llCont: number[];
  ratio: number[];
};

function rma(src: number[], len: number, start: number): number[] {
  const out = new Array<number>(src.length).fill(NaN);
  const alpha = 1 / len;
  const seedIdx = start + len - 1;
  if (seedIdx >= src.length) return out;
  let sum = 0;
  for (let i = start; i <= seedIdx; i++) sum += src[i];
  out[seedIdx] = sum / len;
  for (let i = seedIdx + 1; i < src.length; i++) {
    out[i] = alpha * src[i] + (1 - alpha) * out[i - 1];
  }
  return out;
}

function ema(src: number[], len: number): number[] {
  const out = new Array<number>(src.length).fill(NaN);
  const alpha = 2 / (len + 1);
  const seedIdx = len - 1;
  if (seedIdx >= src.length) return out;
  let sum = 0;
  for (let i = 0; i <= seedIdx; i++) sum += src[i];
  out[seedIdx] = sum / len;
  for (let i = seedIdx + 1; i < src.length; i++) {
    out[i] = alpha * src[i] + (1 - alpha) * out[i - 1];
  }
  return out;
}

function sma(src: number[], len: number): number[] {
  const out = new Array<number>(src.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < src.length; i++) {
    sum += src[i];
    if (i >= len) sum -= src[i - len];
    if (i >= len - 1) out[i] = sum / len;
  }
  return out;
}

/** highest high / lowest low of the `len` bars BEFORE bar i (Pine `[1]` offset) */
function channel(src: number[], len: number, isHigh: boolean): number[] {
  const out = new Array<number>(src.length).fill(NaN);
  for (let i = len; i < src.length; i++) {
    let m = isHigh ? -Infinity : Infinity;
    for (let j = i - len; j < i; j++) {
      m = isHigh ? Math.max(m, src[j]) : Math.min(m, src[j]);
    }
    out[i] = m;
  }
  return out;
}

export function buildSeries(c: Candle[]): Series {
  const n = c.length;
  const high = new Array<number>(n);
  const low = new Array<number>(n);
  const close = new Array<number>(n);
  const vol = new Array<number>(n);
  const tr = new Array<number>(n);

  for (let i = 0; i < n; i++) {
    high[i] = c[i].h;
    low[i] = c[i].l;
    close[i] = c[i].c;
    vol[i] = c[i].v;
    tr[i] =
      i === 0
        ? c[i].h - c[i].l
        : Math.max(
            c[i].h - c[i].l,
            Math.abs(c[i].h - c[i - 1].c),
            Math.abs(c[i].l - c[i - 1].c)
          );
  }

  const atrF = rma(tr, CFG.atrFastLen, 0);
  const atrS = rma(tr, CFG.atrSlowLen, 0);
  const ratio = new Array<number>(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    ratio[i] = atrS[i] > 0 ? atrF[i] / atrS[i] : NaN;
  }

  return {
    atrF,
    atrS,
    ema: ema(close, CFG.trendLen),
    volMA: sma(vol, CFG.volumeLen),
    hhStrong: channel(high, CFG.strongLookback, true),
    llStrong: channel(low, CFG.strongLookback, false),
    hhMed: channel(high, CFG.mediumLookback, true),
    llMed: channel(low, CFG.mediumLookback, false),
    hhQuiet: channel(high, CFG.quietLookback, true),
    llQuiet: channel(low, CFG.quietLookback, false),
    hhCont: channel(high, CFG.contLookback, true),
    llCont: channel(low, CFG.contLookback, false),
    ratio,
  };
}

/* ------------------------------------------------------------------ */
/* Trade accounting                                                    */
/* ------------------------------------------------------------------ */

function markEquity(st: EngineState, price: number): number {
  if (!st.pos) return st.equity;
  const openPnl = (price - st.pos.entryPrice) * st.pos.qty * st.pos.dir;
  const estExitComm = price * st.pos.qty * CFG.commission;
  return st.equity + openPnl - estExitComm;
}

function closePosition(
  st: EngineState,
  price: number,
  idx: number,
  time: number,
  reason: ClosedTrade["reason"],
  out: ClosedTrade[]
): void {
  const p = st.pos!;
  const exitComm = price * p.qty * CFG.commission;
  const gross = (price - p.entryPrice) * p.qty * p.dir;
  const pnl = gross - p.entryCommission - exitComm;

  st.equity += gross - p.entryCommission - exitComm;
  st.lossStreak = pnl <= 0 ? st.lossStreak + 1 : 0;
  st.lastExitIdx = idx;
  st.lastExitDir = p.dir;
  st.lastExitWasTP = pnl > 0; // Pine: lastProfit > 0
  st.rollWindow.push(pnl <= 0);
  if (st.rollWindow.length > CFG.rollK) st.rollWindow.shift();

  const riskPerUnit = Math.abs(p.entryPrice - p.stopPrice);
  out.push({
    side: p.dir === 1 ? "LONG" : "SHORT",
    regime: p.regime,
    qty: p.qty,
    entryPrice: p.entryPrice,
    exitPrice: price,
    entryTime: p.entryTime,
    exitTime: time,
    pnl,
    commission: p.entryCommission + exitComm,
    rMultiple: riskPerUnit > 0 ? pnl / (riskPerUnit * p.qty) : 0,
    reason,
    atrRatio: p.atrRatio,
    effRisk: p.effRisk,
  });
  st.pos = null;
}

/* ------------------------------------------------------------------ */
/* Bar loop                                                            */
/* ------------------------------------------------------------------ */

export function runBars(
  candles: Candle[],
  s: Series,
  st: EngineState,
  fromIdx: number,
  toIdx: number
): BarsResult {
  const trades: ClosedTrade[] = [];
  const entries: EntryEvent[] = [];
  const snapshots: Snapshot[] = [];
  let lastProcessedIdx: number | null = null;
  let killed = false;

  for (let i = Math.max(fromIdx, 0); i <= Math.min(toIdx, candles.length - 1); i++) {
    const bar = candles[i];
    const { h, l, c } = bar;
    if (!st.isRunning || st.killSwitch) break;
    lastProcessedIdx = i;

    // ---- 1. Resting TP/SL orders (active from the bar AFTER the entry fill)
    if (st.pos && i > st.pos.entryIdx) {
      const p = st.pos;
      if (p.dir === 1) {
        if (l <= p.stopPrice) {
          closePosition(st, p.stopPrice - SLIP, i, bar.t, "SL", trades);
        } else if (h >= p.targetPrice) {
          closePosition(st, p.targetPrice, i, bar.t, "TP", trades);
        }
      } else {
        if (h >= p.stopPrice) {
          closePosition(st, p.stopPrice + SLIP, i, bar.t, "SL", trades);
        } else if (l <= p.targetPrice) {
          closePosition(st, p.targetPrice, i, bar.t, "TP", trades);
        }
      }
    }

    // ---- 2. Breakout-failure exit (close confirmation, grace bars elapsed)
    if (
      st.pos &&
      i - st.pos.entryIdx > CFG.failGrace + 1 &&
      Number.isFinite(st.pos.brkLevel)
    ) {
      const p = st.pos;
      if (p.dir === 1 && c < p.brkLevel - CFG.failATR * p.atr) {
        closePosition(st, c - SLIP, i, bar.t, "FAIL", trades);
      } else if (p.dir === -1 && c > p.brkLevel + CFG.failATR * p.atr) {
        closePosition(st, c + SLIP, i, bar.t, "FAIL", trades);
      }
    }

    // ---- 3. Equity peak tracking (mark-to-market at close)
    let marked = markEquity(st, c);
    st.peakEquity = Math.max(st.peakEquity, marked);

    // ---- 4. Signals on the confirmed close
    if (i >= CFG.minBars) {
      const atrR = s.ratio[i];
      const volMA = s.volMA[i];
      const trendE = s.ema[i];
      const ready =
        Number.isFinite(atrR) &&
        Number.isFinite(volMA) &&
        Number.isFinite(s.hhQuiet[i]) &&
        Number.isFinite(trendE);

      if (ready) {
        const participation = bar.v > volMA * CFG.volumeRatio;
        const flat = st.pos === null;
        const longTrendOK = c > trendE;
        const shortTrendOK = c < trendE;

        let longRegime = 0;
        let shortRegime = 0;
        if (atrR > CFG.strongExpansion) {
          if (c > s.hhStrong[i]) longRegime = 3;
          if (c < s.llStrong[i]) shortRegime = 3;
        } else if (atrR > CFG.mediumExpansion) {
          if (c > s.hhMed[i]) longRegime = 2;
          if (c < s.llMed[i]) shortRegime = 2;
        } else if (atrR > CFG.quietExpansion) {
          if (c > s.hhQuiet[i]) longRegime = 1;
          if (c < s.llQuiet[i]) shortRegime = 1;
        }

        // Continuation re-entry after a winner
        let contLong = false;
        let contShort = false;
        const contOK =
          flat &&
          st.lastExitWasTP &&
          st.lastExitIdx !== null &&
          i - st.lastExitIdx <= CFG.contWindow &&
          atrR > CFG.quietExpansion;

        if (longRegime === 0 && shortRegime === 0 && contOK) {
          contLong = st.lastExitDir === 1 && c > s.hhCont[i];
          contShort = st.lastExitDir === -1 && c < s.llCont[i];
          if (contLong) longRegime = 1;
          else if (contShort) shortRegime = 1;
        }

        const canLong = flat || st.pos!.dir === -1; // useReverse
        const canShort = flat || st.pos!.dir === 1;

        const buySignal = canLong && participation && longTrendOK && longRegime > 0;
        const sellSignal =
          !buySignal && canShort && participation && shortTrendOK && shortRegime > 0;

        if (buySignal || sellSignal) {
          const dir: 1 | -1 = buySignal ? 1 : -1;
          const signalRegime = buySignal ? longRegime : shortRegime;
          const isCont = contLong || contShort;

          // ---- reverse an open position first
          if (st.pos && st.pos.dir !== dir) {
            const exitPx = dir === 1 ? c + SLIP : c - SLIP; // covering is adverse side
            closePosition(st, exitPx, i, bar.t, "REVERSE", trades);
          }

          if (!st.pos) {
            // ---- effective risk (throttles + hard band)
            let effRisk: number = CFG.riskPctBase;
            if (st.equity < st.peakEquity) effRisk *= CFG.underwaterMult;
            if (st.lossStreak > 0)
              effRisk *= Math.pow(CFG.streakCut, Math.min(st.lossStreak, CFG.streakMax));
            const rollLosses = st.rollWindow.filter(Boolean).length;
            if (rollLosses > 0)
              effRisk *= Math.pow(CFG.rollCut, Math.min(rollLosses, CFG.rollMax));
            effRisk *=
              atrR <= 1.08 ? CFG.wQuiet : atrR <= 1.17 ? CFG.wMid : CFG.wHot;
            effRisk = Math.min(CFG.riskMax, Math.max(CFG.riskMin, effRisk));

            // ---- sizing
            const stopATR = signalRegime === 3 ? CFG.strongStopATR : CFG.normalStopATR;
            const targetATR =
              signalRegime === 3 ? CFG.strongTargetATR : CFG.normalTargetATR;
            const atrF = s.atrF[i];
            const stopDistance = atrF * stopATR;
            const targetDistance = atrF * targetATR;

            const riskCash = st.equity * effRisk * 0.01;
            const qtyByRisk = stopDistance > 0 ? riskCash / stopDistance : 0;
            const qtyByCap = (st.equity * CFG.leverageCap) / c;
            const qty = Math.max(0, Math.min(qtyByRisk, qtyByCap));

            if (qty > 0) {
              const entryPrice = dir === 1 ? c + SLIP : c - SLIP;
              const stopTicks = Math.max(1, Math.round(stopDistance / CFG.mintick));
              const targetTicks = Math.max(1, Math.round(targetDistance / CFG.mintick));
              const stopPrice =
                dir === 1
                  ? entryPrice - stopTicks * CFG.mintick
                  : entryPrice + stopTicks * CFG.mintick;
              const targetPrice =
                dir === 1
                  ? entryPrice + targetTicks * CFG.mintick
                  : entryPrice - targetTicks * CFG.mintick;

              const brkLevel =
                signalRegime === 3
                  ? dir === 1
                    ? s.hhStrong[i]
                    : s.llStrong[i]
                  : signalRegime === 2
                    ? dir === 1
                      ? s.hhMed[i]
                      : s.llMed[i]
                    : isCont
                      ? dir === 1
                        ? s.hhCont[i]
                        : s.llCont[i]
                      : dir === 1
                        ? s.hhQuiet[i]
                        : s.llQuiet[i];

              const entryCommission = entryPrice * qty * CFG.commission;
              st.equity -= entryCommission;

              entries.push({
                dir,
                price: entryPrice,
                qty,
                stopPrice,
                targetPrice,
                regime: isCont
                  ? "CONTINUATION"
                  : signalRegime === 3
                    ? "STRONG"
                    : signalRegime === 2
                      ? "MEDIUM"
                      : "QUIET",
                effRisk,
                riskCash,
                atrRatio: atrR,
                time: bar.t,
              });

              st.pos = {
                dir,
                qty,
                entryPrice,
                entryIdx: i,
                entryTime: bar.t,
                atr: atrF,
                stopPrice,
                targetPrice,
                brkLevel,
                regime: isCont
                  ? "CONTINUATION"
                  : signalRegime === 3
                    ? "STRONG"
                    : signalRegime === 2
                      ? "MEDIUM"
                      : "QUIET",
                atrRatio: atrR,
                effRisk,
                entryCommission,
              };
            }
          }
        }
      }
    }

    // ---- 5. 9% max-drawdown kill switch (strategy.risk.max_drawdown)
    marked = markEquity(st, c);
    if (st.peakEquity > 0) {
      const dd = ((st.peakEquity - marked) / st.peakEquity) * 100;
      if (dd >= CFG.maxDrawdownPct) {
        if (st.pos) {
          const px = st.pos.dir === 1 ? c - SLIP : c + SLIP;
          closePosition(st, px, i, bar.t, "KILL", trades);
        }
        st.killSwitch = true;
        st.isRunning = false;
        killed = true;
      }
    }

    snapshots.push({
      t: bar.t,
      equity: markEquity(st, c),
      posDir: st.pos ? st.pos.dir : 0,
    });
  }

  return { trades, entries, snapshots, lastProcessedIdx, killed };
}

/* ------------------------------------------------------------------ */
/* Last-bar market summary for the dashboard instruments               */
/* ------------------------------------------------------------------ */

export type MarketSummary = {
  price: number;
  atrFast: number;
  atrRatio: number;
  band: "COLD" | "QUIET" | "MID" | "HOT";
  expansion: "NONE" | "QUIET" | "MEDIUM" | "STRONG";
  ema200: number;
  aboveEma: boolean;
  volRatio: number;
  participationOk: boolean;
  channels: {
    hh15: number; ll15: number; hh60: number; ll60: number;
    hh80: number; ll80: number; hh8: number; ll8: number;
  };
};

export function summarizeMarket(candles: Candle[], s: Series): MarketSummary | null {
  const i = candles.length - 1;
  if (i < CFG.minBars) return null;
  const atrR = s.ratio[i];
  const volMA = s.volMA[i];
  if (!Number.isFinite(atrR)) return null;
  const c = candles[i].c;
  return {
    price: c,
    atrFast: s.atrF[i],
    atrRatio: atrR,
    band: atrR <= 1.08 ? "COLD" : atrR <= 1.17 ? "MID" : "HOT",
    expansion:
      atrR > CFG.strongExpansion
        ? "STRONG"
        : atrR > CFG.mediumExpansion
          ? "MEDIUM"
          : atrR > CFG.quietExpansion
            ? "QUIET"
            : "NONE",
    ema200: s.ema[i],
    aboveEma: c > s.ema[i],
    volRatio: volMA > 0 ? candles[i].v / volMA : 0,
    participationOk: volMA > 0 && candles[i].v > volMA * CFG.volumeRatio,
    channels: {
      hh15: s.hhStrong[i], ll15: s.llStrong[i],
      hh60: s.hhMed[i], ll60: s.llMed[i],
      hh80: s.hhQuiet[i], ll80: s.llQuiet[i],
      hh8: s.hhCont[i], ll8: s.llCont[i],
    },
  };
}
