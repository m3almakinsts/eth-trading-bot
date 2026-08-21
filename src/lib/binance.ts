import type { Candle } from "./strategy";
import { CFG } from "./strategy";

/**
 * Binance public market-data endpoints, tried in order. `data-api.binance.vision`
 * is Binance's dedicated public data host and works from regions where the main
 * API gateway returns geo-blocks (451). All serve identical ETHUSDT spot klines.
 */
const BASES = [
  "https://data-api.binance.vision",
  "https://api.binance.com",
  "https://api.binance.us",
];

async function fetchJson(path: string): Promise<unknown> {
  let lastErr: unknown = new Error("no endpoint");
  for (const base of BASES) {
    try {
      const res = await fetch(`${base}${path}`, { cache: "no-store" });
      if (!res.ok) {
        lastErr = new Error(`Binance ${base}${path} → ${res.status}`);
        continue;
      }
      return await res.json();
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

/**
 * Fetches 2H klines for ETHUSDT from the Binance public market-data API.
 * The final element is the still-forming candle. `closedOnly` drops it.
 */
export async function fetchKlines(limit = 1000, closedOnly = true): Promise<Candle[]> {
  const raw = (await fetchJson(
    `/api/v3/klines?symbol=${CFG.symbol}&interval=${CFG.interval}&limit=${limit}`
  )) as unknown[][];

  let out: Candle[] = raw.map((k) => ({
    t: Number(k[0]),
    o: parseFloat(k[1] as string),
    h: parseFloat(k[2] as string),
    l: parseFloat(k[3] as string),
    c: parseFloat(k[4] as string),
    v: parseFloat(k[5] as string),
  }));

  if (closedOnly && out.length > 0) {
    const last = out[out.length - 1];
    if (last.t + CFG.intervalMs > Date.now()) out = out.slice(0, -1);
  }
  return out;
}

/**
 * Pages backwards through kline history (1000 bars/request, oldest→newest)
 * to assemble up to ~2 years of 2H candles for the bootstrap replay.
 */
export async function fetchKlinesHistory(yearsBack = 2): Promise<Candle[]> {
  const cutoff = Date.now() - yearsBack * 365 * 24 * 60 * 60 * 1000;
  const MAX_BATCHES = 12; // safety cap: 12 × 1000 × 2h ≈ 2.7 years
  const all: Candle[] = [];
  let endTime = Date.now();

  for (let b = 0; b < MAX_BATCHES; b++) {
    const raw = (await fetchJson(
      `/api/v3/klines?symbol=${CFG.symbol}&interval=${CFG.interval}&limit=1000&endTime=${endTime}`
    )) as unknown[][];
    if (!Array.isArray(raw) || raw.length === 0) break;

    const batch: Candle[] = raw.map((k) => ({
      t: Number(k[0]),
      o: parseFloat(k[1] as string),
      h: parseFloat(k[2] as string),
      l: parseFloat(k[3] as string),
      c: parseFloat(k[4] as string),
      v: parseFloat(k[5] as string),
    }));

    all.unshift(...batch);
    const oldest = batch[0].t;
    if (oldest <= cutoff || batch.length < 1000) break;
    endTime = oldest - 1;
  }

  // dedupe + sort (batches overlap by construction guard, but be safe)
  const seen = new Set<number>();
  const out: Candle[] = [];
  for (const c of all) {
    if (seen.has(c.t)) continue;
    seen.add(c.t);
    out.push(c);
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

export type Ticker24h = {
  price: number;
  changePct: number;
  high: number;
  low: number;
  volume: number;
};

export async function fetchTicker(): Promise<Ticker24h | null> {
  try {
    const j = (await fetchJson(
      `/api/v3/ticker/24hr?symbol=${CFG.symbol}`
    )) as Record<string, string>;
    return {
      price: parseFloat(j.lastPrice),
      changePct: parseFloat(j.priceChangePercent),
      high: parseFloat(j.highPrice),
      low: parseFloat(j.lowPrice),
      volume: parseFloat(j.quoteVolume),
    };
  } catch {
    return null;
  }
}
