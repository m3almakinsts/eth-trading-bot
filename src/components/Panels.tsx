"use client";

import { ShieldAlert, TrendingUp, TrendingDown, Activity, Gauge } from "lucide-react";
import type { DashboardPayload, PositionView, Stats } from "@/lib/engine";
import type { MarketSummary } from "@/lib/strategy";
import { fmtPct, fmtPrice, fmtQty, fmtRatio, fmtSignedUSD, fmtUSD } from "@/lib/format";

/* ---------------------------------------------------------------- */
/* Position ticket                                                   */
/* ---------------------------------------------------------------- */

export function PositionTicket({ position, price }: { position: PositionView | null; price: number | null }) {
  if (!position) {
    return (
      <div className="panel overflow-hidden p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[12px] font-semibold text-zinc-100">Active trade</div>
            <div className="mt-0.5 text-[9px] text-zinc-600">What the bot is holding right now</div>
          </div>
          <span className="friendly-chip text-zinc-500!">No position</span>
        </div>
        <div className="mt-3 flex items-center gap-3 rounded-xl border border-vio/8 bg-gradient-to-r from-vio/[0.055] to-transparent p-3">
          <div className="relative grid h-11 w-11 flex-none place-items-center rounded-full border border-vio/15">
            <span className="absolute inset-1 rounded-full border border-vio/10" />
            <span className="h-2 w-2 rounded-full bg-vio/70 pulse-amber" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-[12px] font-medium text-zinc-300">
              <Activity size={12} className="text-vio" /> Quietly scanning
            </div>
            <p className="mt-1 text-[9.5px] leading-relaxed text-zinc-600">
              Waiting for ATR expansion, a clean channel break, and enough volume. Patience is part of the strategy.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const isLong = position.dir === 1;
  const pnlColor = position.openPnl >= 0 ? "text-bull" : "text-bear";
  const distTP = price ? Math.abs(position.targetPrice - price) / price * 100 : 0;
  const distSL = price ? Math.abs(position.stopPrice - price) / price * 100 : 0;
  const riskAtStop = Math.abs(position.entryPrice - position.stopPrice) * position.qty;

  return (
    <div className="panel overflow-hidden p-4">
      <span className={`absolute inset-x-0 top-0 h-px ${isLong ? "bg-gradient-to-r from-bull/80 to-transparent" : "bg-gradient-to-r from-bear/80 to-transparent"}`} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[12px] font-semibold text-zinc-100">Active trade</div>
          <div className="mt-0.5 text-[9px] text-zinc-600">Live, marked to the latest price</div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="friendly-chip text-zinc-500!">{position.regime.toLowerCase()}</span>
          <span
            className={`rounded-full border px-2.5 py-1 text-[9px] font-semibold ${
              isLong
                ? "border-bull/25 bg-bull/8 text-bull"
                : "border-bear/25 bg-bear/8 text-bear"
            }`}
          >
            {isLong ? "▲ Long" : "▼ Short"}
          </span>
        </div>
      </div>

      <div className="mt-3 flex items-end justify-between rounded-xl border border-white/6 bg-white/[0.018] p-3">
        <div>
          <div className="text-[9px] text-zinc-600">Open P&amp;L</div>
          <span className={`num mt-1 block text-[28px] font-medium leading-none ${pnlColor}`}>
            {fmtSignedUSD(position.openPnl)}
          </span>
        </div>
        <span className={`num rounded-full px-2 py-1 text-[10px] ${position.openPnl >= 0 ? "bg-bull/8 text-bull" : "bg-bear/8 text-bear"}`}>
          {fmtPct(position.openPnlPct)}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="mini-surface p-2.5">
          <div className="text-[8.5px] text-zinc-600">Size</div>
          <div className="num mt-1 text-[11px] text-zinc-200">{fmtQty(position.qty)} ETH</div>
        </div>
        <div className="mini-surface p-2.5">
          <div className="text-[8.5px] text-zinc-600">Entry</div>
          <div className="num mt-1 text-[11px] text-zinc-200">${fmtPrice(position.entryPrice)}</div>
        </div>
        <div className="mini-surface border-bull/10! p-2.5">
          <div className="text-[8.5px] text-zinc-600">Take profit · {distTP.toFixed(2)}% away</div>
          <div className="num mt-1 text-[11px] text-bull">${fmtPrice(position.targetPrice)}</div>
        </div>
        <div className="mini-surface border-bear/10! p-2.5">
          <div className="text-[8.5px] text-zinc-600">Stop loss · {distSL.toFixed(2)}% away</div>
          <div className="num mt-1 text-[11px] text-bear">${fmtPrice(position.stopPrice)}</div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-[9px] text-zinc-600">
        <span>Risk at stop ≈ <b className="num font-normal text-zinc-400">{fmtUSD(riskAtStop, 0)}</b></span>
        <span>ATR14 <b className="num font-normal text-zinc-400">{position.atr.toFixed(1)}</b></span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Regime gauge (ATR expansion)                                      */
/* ---------------------------------------------------------------- */

const G_MIN = 0.95;
const G_MAX = 1.26;
const gx = (v: number, w: number) => ((Math.min(G_MAX, Math.max(G_MIN, v)) - G_MIN) / (G_MAX - G_MIN)) * w;

export function RegimeGauge({ market }: { market: MarketSummary | null }) {
  const W = 300;
  const H = 88;
  const v = market?.atrRatio ?? 1.0;
  const bandColor =
    !market ? "#5c6570" : market.band === "COLD" ? "#8a93a0" : market.band === "MID" ? "#8b7cf7" : "#f5b83d";

  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between">
        <span className="label flex items-center gap-1.5">
          <Gauge size={11} /> Volatility regime · ATR14/ATR28
        </span>
        <span className="num text-lg font-medium" style={{ color: bandColor }}>
          {market ? fmtRatio(market.atrRatio) : "—"}
        </span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full">
        {/* weight bands */}
        <rect x={0} y={26} width={gx(1.08, W)} height={10} fill="rgba(255,255,255,0.05)" />
        <rect x={gx(1.08, W)} y={26} width={gx(1.17, W) - gx(1.08, W)} height={10} fill="rgba(139,124,247,0.14)" />
        <rect x={gx(1.17, W)} y={26} width={W - gx(1.17, W)} height={10} fill="rgba(245,184,61,0.12)" />
        {/* band boundaries */}
        {[1.08, 1.17].map((t) => (
          <line key={t} x1={gx(t, W)} y1={24} x2={gx(t, W)} y2={38} stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
        ))}
        {/* expansion triggers */}
        {[1.02, 1.05, 1.1].map((t) => (
          <g key={t}>
            <line x1={gx(t, W)} y1={20} x2={gx(t, W)} y2={26} stroke="rgba(53,242,166,0.5)" strokeWidth="1" />
            <text x={gx(t, W)} y={16} textAnchor="middle" fontSize="7.5" fill="#5c6570" fontFamily="'JetBrains Mono',monospace">
              {t.toFixed(2)}
            </text>
          </g>
        ))}
        {/* needle */}
        <g className="needle" style={{ transform: `translateX(${gx(v, W)}px)` }}>
          <line x1={0} y1={18} x2={0} y2={44} stroke={bandColor} strokeWidth="2" />
          <path d={`M-4 46 L4 46 L0 52 Z`} fill={bandColor} />
        </g>
        <line x1={0} y1={36} x2={W} y2={36} stroke="rgba(255,255,255,0.25)" strokeWidth="0.5" />
        {/* labels */}
        <text x={2} y={64} fontSize="8" fill="#5c6570" letterSpacing="1.5">RISK ×0.80</text>
        <text x={gx(1.125, W)} y={64} textAnchor="middle" fontSize="8" fill="#8b7cf7" letterSpacing="1.5">×1.10</text>
        <text x={W - 2} y={64} textAnchor="end" fontSize="8" fill="#f5b83d" letterSpacing="1.5">×0.60</text>
        <text x={2} y={76} fontSize="7" fill="#3f4650" letterSpacing="1">QUIET TAPE</text>
        <text x={W - 2} y={76} textAnchor="end" fontSize="7" fill="#3f4650" letterSpacing="1">HOT TAPE</text>
      </svg>

      <div className="mt-1 flex items-center justify-between text-[10px]">
        <span className="label text-[9px]!">
          Expansion: <span className="num text-zinc-300">{market?.expansion ?? "—"}</span>
        </span>
        <span className="label text-[9px]!">
          Sizing weight: <span className="num" style={{ color: bandColor }}>
            {market ? (market.band === "COLD" ? "×0.80" : market.band === "MID" ? "×1.10" : "×0.60") : "—"}
          </span>
        </span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Filters + risk breakdown                                          */
/* ---------------------------------------------------------------- */

export function FiltersAndRisk({ data }: { data: DashboardPayload }) {
  const m = data.market;
  const underwater = data.equity < data.peakEquity;
  return (
    <div className="panel overflow-hidden p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[12px] font-semibold text-zinc-100">Signal checklist</div>
          <div className="mt-0.5 text-[9px] text-zinc-600">What must line up before the bot acts</div>
        </div>
        <span className="friendly-chip text-zinc-500!">live checks</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-white/8 bg-white/2 px-2.5 py-2">
          <div className="label text-[8px]!">EMA-200 trend</div>
          <div className={`mt-1 flex items-center gap-1 text-[12px] font-medium ${m ? (m.aboveEma ? "text-bull" : "text-bear") : "text-zinc-500"}`}>
            {m ? (m.aboveEma ? <TrendingUp size={13} /> : <TrendingDown size={13} />) : null}
            {m ? (m.aboveEma ? "ABOVE" : "BELOW") : "—"}
          </div>
        </div>
        <div className="mini-surface px-2.5 py-2.5">
          <div className="text-[8.5px] text-zinc-600">Volume / MA30</div>
          <div className={`num mt-1 text-[12px] font-medium ${m && m.participationOk ? "text-bull" : "text-zinc-400"}`}>
            {m ? `${m.volRatio.toFixed(2)}× ${m.participationOk ? "✓" : "✗"}` : "—"}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-end justify-between border-t border-white/6 pt-3">
        <div>
          <div className="text-[10px] font-medium text-zinc-400">Next trade budget</div>
          <div className="mt-0.5 text-[8.5px] text-zinc-600">after every active risk throttle</div>
        </div>
        <span className="num text-[17px] font-medium text-zinc-100">
          {data.riskNow.toFixed(2)}<span className="text-[10px] text-zinc-500">%</span>
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className={`label rounded border px-1.5 py-[3px] text-[8px]! ${underwater ? "border-amber/40 bg-amber/10 text-amber!" : "border-white/8 text-zinc-600!"}`}>
          UNDERWATER ×0.55
        </span>
        <span className={`label rounded border px-1.5 py-[3px] text-[8px]! ${data.lossStreak > 0 ? "border-amber/40 bg-amber/10 text-amber!" : "border-white/8 text-zinc-600!"}`}>
          STREAK {data.lossStreak}
        </span>
        <span className={`label rounded border px-1.5 py-[3px] text-[8px]! ${data.rollLosses > 0 ? "border-amber/40 bg-amber/10 text-amber!" : "border-white/8 text-zinc-600!"}`}>
          ROLL8 −{data.rollLosses}
        </span>
        <span className="label rounded border border-white/8 px-1.5 py-[3px] text-[8px]! text-zinc-600!">
          BAND 1–2%
        </span>
      </div>

      {/* drawdown kill meter */}
      <div className="mt-4 border-t border-line pt-3">
        <div className="label flex items-center justify-between text-[9px]!">
          <span className="flex items-center gap-1.5">
            <ShieldAlert size={11} className="text-bear/80" /> Max-DD kill switch
          </span>
          <span className="num text-zinc-300 normal-case tracking-normal">
            {data.drawdownPct.toFixed(2)}% / 9.00%
          </span>
        </div>
        <div className="relative mt-2 h-1.5 overflow-hidden rounded-full bg-white/6">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-amber/70 to-bear transition-[width] duration-700"
            style={{ width: `${Math.min(100, (data.drawdownPct / 9) * 100).toFixed(1)}%` }}
          />
          <div className="absolute inset-y-0 right-0 w-[2px] bg-bear" />
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Stat tiles                                                        */
/* ---------------------------------------------------------------- */

function Tile({
  label,
  value,
  sub,
  tone,
  accent = "bg-white/12",
  emphasis = false,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
  accent?: string;
  emphasis?: boolean;
}) {
  return (
    <div className="panel group relative overflow-hidden px-4 py-3">
      <span
        className={`absolute inset-x-0 top-0 h-px ${accent} opacity-50 transition-opacity duration-300 group-hover:opacity-100`}
      />
      <div className="label text-[8.5px]! tracking-[0.16em]!">{label}</div>
      <div
        className={`num mt-2 font-medium leading-none ${
          emphasis ? "text-[26px]" : "text-[20px]"
        } ${tone ?? "text-zinc-100"}`}
      >
        {value}
      </div>
      {sub && <div className="num mt-2 text-[10px] text-zinc-600">{sub}</div>}
    </div>
  );
}

export function StatTiles({ data }: { data: DashboardPayload }) {
  const s: Stats = data.stats;
  const ddTone = s.maxDrawdownPct > 6 ? "text-bear" : s.maxDrawdownPct > 3.5 ? "text-amber" : "text-zinc-100";
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-7">
      <Tile
        label="Marked equity"
        value={fmtUSD(data.markedEquity, 0)}
        sub={`peak ${fmtUSD(data.peakEquity, 0)}`}
        accent="bg-gradient-to-r from-vio/70 to-transparent"
        emphasis
      />
      <Tile
        label="Net P&L"
        value={fmtSignedUSD(s.netPnl, 0)}
        sub={fmtPct(s.netPnlPct)}
        tone={s.netPnl >= 0 ? "text-bull" : "text-bear"}
        accent={s.netPnl >= 0 ? "bg-gradient-to-r from-bull/70 to-transparent" : "bg-gradient-to-r from-bear/70 to-transparent"}
        emphasis
      />
      <Tile
        label="Win rate"
        value={`${s.winRate.toFixed(1)}%`}
        sub={`${s.wins}W · ${s.losses}L`}
        tone={s.winRate >= 50 ? "text-bull" : "text-zinc-100"}
        accent="bg-gradient-to-r from-bull/50 to-transparent"
      />
      <Tile
        label="Profit factor"
        value={s.profitFactor >= 99 ? "∞" : s.profitFactor.toFixed(2)}
        sub={s.profitFactor >= 1.3 ? "robust" : s.profitFactor >= 1 ? "marginal" : "underwater"}
        tone={s.profitFactor >= 1 ? "text-bull" : "text-bear"}
        accent="bg-gradient-to-r from-bull/50 to-transparent"
      />
      <Tile
        label="Max drawdown"
        value={`${s.maxDrawdownPct.toFixed(2)}%`}
        sub="kill switch @ 9.0%"
        tone={ddTone}
        accent="bg-gradient-to-r from-amber/50 to-transparent"
      />
      <Tile
        label="Avg R"
        value={`${s.avgR >= 0 ? "+" : ""}${s.avgR.toFixed(2)}`}
        sub="per closed trade"
        accent="bg-gradient-to-r from-vio/50 to-transparent"
      />
      <Tile
        label="Trades"
        value={String(s.trades)}
        sub={`loss streak ${data.lossStreak > 0 ? data.lossStreak : "0"}`}
        accent="bg-gradient-to-r from-white/40 to-transparent"
      />
    </div>
  );
}
