"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldAlert, Wifi, WifiOff, Zap } from "lucide-react";
import type { DashboardPayload } from "@/lib/engine";
import { fmtPrice } from "@/lib/format";
import Header from "./Header";
import CandleChart from "./CandleChart";
import EquityChart from "./EquityChart";
import { PositionTicket, RegimeGauge, FiltersAndRisk, StatTiles } from "./Panels";
import TradesTable from "./TradesTable";

const POLL_MS = 10_000;

export default function Terminal() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [dismissedStandby, setDismissedStandby] = useState(false);
  const [notifyState, setNotifyState] = useState<"idle" | "sending" | "ok" | "fail">("idle");
  const [notifyError, setNotifyError] = useState<string | null>(null);
  const inflight = useRef(false);

  const refresh = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      const j = (await res.json()) as DashboardPayload;
      setData(j);
    } catch {
      /* keep stale data */
    } finally {
      inflight.current = false;
    }
  }, []);

  useEffect(() => {
    void refresh();
    const poll = setInterval(() => void refresh(), POLL_MS);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    const vis = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", vis);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [refresh]);

  const action = useCallback(
    async (a: "start" | "pause" | "reset") => {
      setBusy(true);
      try {
        await fetch("/api/control", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: a }),
        });
      } finally {
        await refresh();
        setBusy(false);
      }
    },
    [refresh]
  );

  const testNotify = useCallback(async () => {
    setNotifyState("sending");
    setNotifyError(null);
    try {
      const res = await fetch("/api/notify/test", { method: "POST" });
      const j = (await res.json()) as { ok: boolean; error?: string };
      setNotifyState(j.ok ? "ok" : "fail");
      setNotifyError(j.ok ? null : (j.error ?? "send failed"));
    } catch (err) {
      setNotifyState("fail");
      setNotifyError(err instanceof Error ? err.message : "send failed");
    } finally {
      window.setTimeout(() => setNotifyState("idle"), 5000);
    }
  }, []);

  const showStandby =
    !!data && data.neverRan && !data.running && !busy && !dismissedStandby;

  const lastCandle = data?.candles.length ? data.candles[data.candles.length - 1] : null;

  return (
    <div className="relative z-10 flex min-h-screen flex-col">
      <Header
        data={data}
        now={now}
        busy={busy}
        onAction={action}
        notifyState={notifyState}
        notifyError={notifyError}
        onTestNotify={testNotify}
      />

      {/* kill-switch banner */}
      <AnimatePresence>
        {data?.killSwitch && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="kill-glow overflow-hidden border-b border-bear/50 bg-bear/8"
          >
            <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-4 py-2.5 lg:px-6">
              <ShieldAlert size={15} className="text-bear" />
              <span className="text-[12px] text-bear">
                RISK LIMIT BREACHED — drawdown crossed 9% of peak equity. Position flattened per{" "}
                <span className="num">strategy.risk.max_drawdown(9.0)</span>. Trading halted.
              </span>
              <button
                onClick={() => void action("start")}
                className="ml-auto rounded border border-bear/50 px-3 py-1 text-[10px] font-semibold tracking-[0.15em] text-bear transition-colors hover:bg-bear/15"
              >
                RESUME ENGINE
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* feed error */}
      {data?.error && (
        <div className="flex items-center gap-2 border-b border-amber/30 bg-amber/5 px-4 py-1.5 lg:px-6">
          {data.ok ? <Wifi size={12} className="text-amber" /> : <WifiOff size={12} className="text-amber" />}
          <span className="label text-[9px]! text-amber!">
            Data feed hiccup — retrying ({data.error})
          </span>
        </div>
      )}

      <main className="mx-auto w-full max-w-[1600px] flex-1 space-y-2 p-3 lg:p-4">
        <div className="grid grid-cols-12 gap-2">
          {/* main chart */}
          <motion.section
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="panel relative col-span-12 flex h-[300px] flex-col overflow-hidden md:h-[440px] xl:col-span-8"
          >
            <div className="pointer-events-none absolute left-0 right-0 top-0 h-px overflow-hidden">
              <div className="sweep h-px w-1/3 bg-gradient-to-r from-transparent via-vio/60 to-transparent" />
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-4 py-2">
              <span className="text-[11px] font-semibold tracking-[0.18em] text-zinc-300">
                ETHUSDT · 2H
              </span>
              {lastCandle && (
                <span className="num text-[10px] text-zinc-500">
                  O <span className="text-zinc-300">{fmtPrice(lastCandle.o)}</span>
                  {"  "}H <span className="text-bull">{fmtPrice(lastCandle.h)}</span>
                  {"  "}L <span className="text-bear">{fmtPrice(lastCandle.l)}</span>
                  {"  "}C <span className="text-zinc-300">{fmtPrice(lastCandle.c)}</span>
                </span>
              )}
              {data?.market && (
                <span className="num ml-auto text-[10px] text-zinc-500">
                  ATR14 <span className="text-zinc-300">{data.market.atrFast.toFixed(1)}</span>
                  {" · "}EMA200 <span className="text-zinc-300">{fmtPrice(data.market.ema200)}</span>
                </span>
              )}
              {busy && (
                <span className="label text-[9px]! text-vio!">replaying market history…</span>
              )}
            </div>
            <div className="relative min-h-0 flex-1">
              <div className="pointer-events-none absolute inset-0 z-10 flex items-end justify-end p-4">
                <span className="select-none text-[120px] font-black leading-none tracking-tighter text-white/3">
                  α3.3
                </span>
              </div>
              {data && data.candles.length > 0 ? (
                <CandleChart candles={data.candles} trades={data.trades} position={data.position} />
              ) : (
                <div className="label flex h-full items-center justify-center text-[10px]!">
                  Loading market data…
                </div>
              )}
            </div>
          </motion.section>

          {/* right rail */}
          <motion.aside
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="col-span-12 grid content-start gap-2 md:grid-cols-3 xl:col-span-4 xl:grid-cols-1"
          >
            <PositionTicket position={data?.position ?? null} price={data?.price ?? null} />
            <RegimeGauge market={data?.market ?? null} />
            {data && <FiltersAndRisk data={data} />}
          </motion.aside>
        </div>

        {/* stat tiles */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
        >
          {data && <StatTiles data={data} />}
        </motion.div>

        <div className="grid grid-cols-12 gap-2">
          {/* equity curve */}
          <motion.section
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="panel col-span-12 flex h-[240px] flex-col overflow-hidden xl:col-span-7"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-2">
              <span className="text-[11px] font-semibold tracking-[0.18em] text-zinc-300">
                EQUITY CURVE
              </span>
              <span className="label text-[9px]!">mark-to-market · per 2H close</span>
            </div>
            <div className="min-h-0 flex-1">
              {data && data.equityCurve.length > 1 ? (
                <EquityChart curve={data.equityCurve} />
              ) : (
                <div className="label flex h-full items-center justify-center text-[10px]!">
                  {data?.running ? "Building equity history…" : "Start the engine to build the curve"}
                </div>
              )}
            </div>
          </motion.section>

          {/* trade log */}
          <motion.section
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="panel col-span-12 h-[320px] overflow-hidden xl:col-span-5"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-2">
              <span className="text-[11px] font-semibold tracking-[0.18em] text-zinc-300">
                TRADE LOG
              </span>
              <span className="label text-[9px]!">{data?.stats.trades ?? 0} closed</span>
            </div>
            <div className="h-[calc(100%-37px)]">
              <TradesTable trades={data?.trades ?? []} />
            </div>
          </motion.section>
        </div>
      </main>

      <footer className="label flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5 text-[9px]! lg:px-6">
        <span>
          Paper engine · 100k USD virtual · ATR regimes 15/60/80 · TP/SL 4.0×1.48 / 4.6×0.8 ·
          risk band 1–2% · lev cap 2× · server autopilot ticks 2H closes + sends 30m Telegram position updates
        </span>
        <span>
          Data: Binance spot klines · Charts: TradingView Lightweight Charts · Not financial advice
        </span>
      </footer>

      {/* standby overlay */}
      <AnimatePresence>
        {showStandby && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.4 } }}
            className="fixed inset-0 z-50 grid place-items-center bg-ink/85 p-4 backdrop-blur-md"
          >
            <div className="relative max-w-2xl text-center">
              <div className="pointer-events-none absolute left-1/2 top-1/2 h-[380px] w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-vio/10 blur-[120px]" />
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="label text-[10px]! text-vio!">Binance paper trading engine</div>
                <h1 className="mt-3 text-4xl font-semibold leading-[1.05] tracking-tight md:text-6xl">
                  Adaptive Volatility
                  <br />
                  <span className="bg-gradient-to-r from-bull via-zinc-100 to-vio bg-clip-text text-transparent">
                    Breakout v3.3c
                  </span>
                </h1>
                <p className="num mx-auto mt-4 max-w-xl text-[12px] leading-relaxed text-zinc-400">
                  ETHUSDT · 2H — three ATR-expansion regimes trade channel breakouts of 15/60/80 bars,
                  sized by drawdown-aware throttles clamped to a hard 1–2% risk band, with failure
                  exits, continuation re-entries and a 9% equity kill switch.
                </p>

                <div className="num mx-auto mt-6 grid max-w-lg grid-cols-3 gap-2 text-left">
                  {[
                    ["REGIMES", "1.02 / 1.05 / 1.10"],
                    ["TP · SL", "1.48×4.0 / 0.8×4.6 ATR"],
                    ["RISK BAND", "1.00–2.00% / trade"],
                    ["DD BACKSTOP", "9.0% of peak"],
                    ["COMMISSION", "0.05% / side"],
                    ["LEVERAGE CAP", "2.0× notional"],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-lg border border-white/8 bg-white/3 px-3 py-2">
                      <div className="label text-[8px]!">{k}</div>
                      <div className="mt-1 text-[11px] text-zinc-200">{v}</div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => void action("start")}
                  disabled={busy}
                  className="group mx-auto mt-8 flex items-center gap-3 rounded-xl border border-bull/40 bg-bull/12 px-8 py-4 text-[13px] font-semibold tracking-[0.2em] text-bull transition-all hover:bg-bull/20 hover:shadow-[0_0_50px_rgba(53,242,166,0.3)] disabled:opacity-40"
                >
                  <Zap size={16} className="fill-current" />
                  {busy ? "REPLAYING…" : "IGNITE ENGINE"}
                </button>
                <div className="label mt-3 text-[9px]!">
                  First ignition replays the last 2 years of 2H closes (~8,700 bars),
                  then trades live bar-by-bar
                </div>
                <button
                  onClick={() => setDismissedStandby(true)}
                  className="label mt-5 text-[9px]! text-zinc-600! underline-offset-4 hover:underline"
                >
                  Explore the terminal first
                </button>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
