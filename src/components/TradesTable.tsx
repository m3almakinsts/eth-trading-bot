"use client";

import type { TradeView } from "@/lib/engine";
import { fmtPrice, fmtQty, fmtSignedUSD, fmtTime } from "@/lib/format";

const reasonStyle: Record<string, string> = {
  TP: "text-bull border-bull/30 bg-bull/8",
  SL: "text-bear border-bear/30 bg-bear/8",
  FAIL: "text-amber border-amber/30 bg-amber/8",
  REVERSE: "text-vio border-vio/30 bg-vio/8",
  KILL: "text-bear border-bear/50 bg-bear/15",
};

export default function TradesTable({ trades }: { trades: TradeView[] }) {
  const cols = "grid-cols-[48px_58px_52px_1fr_1fr_52px_84px_92px]";
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="overflow-x-auto">
        <div className={`grid ${cols} min-w-[560px] gap-x-2 border-b border-line px-4 py-2`}>
          {["SIDE", "EXIT", "REGIME", "ENTRY", "EXIT P", "R", "P&L", "TIME"].map((h) => (
            <span key={h} className="label text-[9px]! truncate">
              {h}
            </span>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {trades.length === 0 && (
          <div className="flex h-full items-center justify-center px-6 text-center">
            <span className="label tracking-[0.14em]!">
              No closed trades yet — the engine logs them here
            </span>
          </div>
        )}
        {trades.map((t) => (
          <div
            key={t.id}
            className={`num grid ${cols} min-w-[560px] items-center gap-x-2 border-b border-white/4 px-4 py-[7px] text-[11px] text-zinc-300 transition-colors hover:bg-white/3`}
          >
            <span className={t.side === "LONG" ? "text-bull" : "text-bear"}>
              {t.side === "LONG" ? "▲ L" : "▼ S"}
            </span>
            <span>
              <span
                className={`inline-block rounded border px-1.5 py-[1px] text-[9px] tracking-wider ${
                  reasonStyle[t.reason] ?? "border-white/15 text-zinc-400"
                }`}
              >
                {t.reason}
              </span>
            </span>
            <span className="truncate text-[10px] text-zinc-500" title={t.regime}>
              {t.regime.slice(0, 4)}
            </span>
            <span>{fmtPrice(t.entryPrice)}</span>
            <span>{fmtPrice(t.exitPrice)}</span>
            <span className={t.rMultiple !== null ? (t.rMultiple >= 0 ? "text-bull" : "text-bear") : "text-zinc-600"}>
              {t.rMultiple !== null ? `${t.rMultiple >= 0 ? "+" : ""}${t.rMultiple.toFixed(2)}` : "—"}
            </span>
            <span className={t.pnl >= 0 ? "text-bull" : "text-bear"}>
              {fmtSignedUSD(t.pnl, 0)}
            </span>
            <span className="flex items-center gap-1 text-[10px] text-zinc-500">
              {t.origin === "LIVE" && <span className="h-1 w-1 rounded-full bg-bull" />}
              {fmtTime(t.exitTime)}
            </span>
          </div>
        ))}
      </div>
      <div className="label border-t border-line px-4 py-1.5 text-[9px]!">
        qty ×4dp · commission 0.05%/side · slippage 10 ticks
      </div>
    </div>
  );
}
