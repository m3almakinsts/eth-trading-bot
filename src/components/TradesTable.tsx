"use client";

import type { TradeView } from "@/lib/engine";
import { fmtDate, fmtPrice, fmtQty, fmtSignedUSD, fmtTimeOnly } from "@/lib/format";

const reasonStyle: Record<string, string> = {
  TP: "text-bull border-bull/25 bg-bull/8",
  SL: "text-bear border-bear/25 bg-bear/8",
  FAIL: "text-amber border-amber/25 bg-amber/8",
  REVERSE: "text-vio border-vio/25 bg-vio/8",
  KILL: "text-bear border-bear/45 bg-bear/15",
};

/** `14h`, `3d 6h` — how long the position was held */
function fmtHeld(ms: number): string {
  const h = Math.max(0, Math.round(ms / 3_600_000));
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

const COLS = "grid-cols-[54px_62px_74px_1fr_1fr_46px_82px_52px_78px]";

function HeadCell({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`label truncate text-[8.5px]! tracking-[0.16em]! ${className}`}>{children}</span>
  );
}

export default function TradesTable({ trades }: { trades: TradeView[] }) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="overflow-x-auto border-b border-line">
        <div className={`grid ${COLS} min-w-[700px] items-center gap-x-2.5 px-4 py-2.5`}>
          <HeadCell>Side</HeadCell>
          <HeadCell>Exit</HeadCell>
          <HeadCell>Regime</HeadCell>
          <HeadCell className="text-right!">Entry</HeadCell>
          <HeadCell className="text-right!">Exit px</HeadCell>
          <HeadCell className="text-right!">R</HeadCell>
          <HeadCell className="text-right!">Net P&amp;L</HeadCell>
          <HeadCell className="text-right!">Held</HeadCell>
          <HeadCell className="text-right!">Closed</HeadCell>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {trades.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
            <div className="h-px w-10 bg-gradient-to-r from-transparent via-white/25 to-transparent" />
            <span className="label tracking-[0.14em]!">No closed trades yet</span>
            <span className="text-[10px] text-zinc-600">
              Exits are logged here the moment a 2H bar settles them
            </span>
          </div>
        )}

        {trades.map((t) => {
          const win = t.pnl >= 0;
          return (
            <div
              key={t.id}
              className="group relative border-b border-white/3 transition-colors duration-150 hover:bg-white/[0.028]"
            >
              <span
                className={`absolute left-0 top-0 h-full w-[2px] opacity-0 transition-opacity duration-200 group-hover:opacity-100 ${
                  win ? "bg-bull/70" : "bg-bear/70"
                }`}
              />
              <div className={`num grid ${COLS} min-w-[700px] items-center gap-x-2.5 px-4 py-2.5 text-[11px]`}>
                <span
                  className={`flex items-center gap-1.5 font-medium ${
                    t.side === "LONG" ? "text-bull" : "text-bear"
                  }`}
                >
                  <span className="text-[8px] leading-none">{t.side === "LONG" ? "▲" : "▼"}</span>
                  {t.side === "LONG" ? "L" : "S"}
                  {t.origin === "LIVE" && (
                    <span className="h-1 w-1 rounded-full bg-bull/80" title="Live trade" />
                  )}
                </span>

                <span>
                  <span
                    className={`inline-block rounded-sm border px-1.5 py-[2px] text-[8.5px] tracking-[0.08em] ${
                      reasonStyle[t.reason] ?? "border-white/12 text-zinc-400"
                    }`}
                  >
                    {t.reason}
                  </span>
                </span>

                <span className="truncate text-[10px] capitalize text-zinc-500" title={t.regime}>
                  {t.regime.toLowerCase()}
                </span>

                <span className="text-right text-zinc-400">{fmtPrice(t.entryPrice)}</span>
                <span className="text-right text-zinc-300">{fmtPrice(t.exitPrice)}</span>

                <span
                  className={`text-right ${
                    t.rMultiple === null
                      ? "text-zinc-700"
                      : t.rMultiple >= 0
                        ? "text-bull/90"
                        : "text-bear/90"
                  }`}
                >
                  {t.rMultiple !== null
                    ? `${t.rMultiple >= 0 ? "+" : ""}${t.rMultiple.toFixed(2)}`
                    : "—"}
                </span>

                <span
                  className={`text-right font-medium ${win ? "text-bull" : "text-bear"}`}
                >
                  {fmtSignedUSD(t.pnl, 0)}
                </span>

                <span className="text-right text-[10px] text-zinc-600">
                  {fmtHeld(t.exitTime - t.entryTime)}
                </span>

                <span className="text-right leading-tight">
                  <span className="block text-[10px] text-zinc-400">{fmtDate(t.exitTime)}</span>
                  <span className="block text-[9px] text-zinc-600">
                    {fmtTimeOnly(t.exitTime)} UTC
                  </span>
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between border-t border-line px-4 py-2">
        <span className="label text-[8.5px]!">
          Showing {trades.length} · 0.05%/side · 10-tick slippage
        </span>
        <span className="label text-[8.5px]!">All times UTC</span>
      </div>
    </div>
  );
}
