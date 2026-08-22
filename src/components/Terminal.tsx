"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart3,
  ChartCandlestick,
  HeartPulse,
  History,
  Play,
  ShieldAlert,
  Sparkles,
  WalletCards,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";
import type { DashboardPayload } from "@/lib/engine";
import { fmtPrice } from "@/lib/format";
import dynamic from "next/dynamic";
import Header from "./Header";
import { PositionTicket, RegimeGauge, FiltersAndRisk, StatTiles } from "./Panels";
import TradesTable from "./TradesTable";

const CandleChart = dynamic(() => import("./CandleChart"), {
  ssr: false,
  loading: () => (
    <div className="label flex h-full items-center justify-center text-[10px]!">
      Loading chart engine…
    </div>
  ),
});

const EquityChart = dynamic(() => import("./EquityChart"), {
  ssr: false,
  loading: () => (
    <div className="label flex h-full items-center justify-center text-[10px]!">
      Loading equity curve…
    </div>
  ),
});

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
  const hour = new Date(now).getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const deskMessage = data?.position
    ? `Your bot is riding a ${data.position.dir === 1 ? "long" : "short"} ${data.position.regime.toLowerCase()} setup.`
    : data?.running
      ? "Your bot is watching ETH and waiting patiently for the next clean breakout."
      : "Your paper bot is paused. Start whenever you’re ready.";

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
        onRefresh={() => void refresh()}
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

      <main className="mx-auto w-full max-w-[1640px] flex-1 space-y-3 px-3 py-4 sm:px-5 lg:px-7 lg:py-5">
        {/* Friendly desk introduction */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="dashboard-welcome"
        >
          <div className="flex min-w-0 items-start gap-3">
            <div className="welcome-orb">
              <Sparkles size={15} />
            </div>
            <div className="min-w-0">
              <h1 className="text-[18px] font-semibold tracking-[-0.025em] text-zinc-100 sm:text-[21px]">
                {greeting} <span className="text-vio">—</span> here’s your bot at a glance.
              </h1>
              <p className="mt-1 text-[11px] text-zinc-500 sm:text-[12px]">{deskMessage}</p>
            </div>
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            <span className="friendly-chip">
              <WalletCards size={11} /> Paper money only
            </span>
            <span className="friendly-chip">
              <ShieldAlert size={11} /> 9% safety stop
            </span>
          </div>
        </motion.div>

        <div className="grid grid-cols-12 gap-3">
          {/* main chart */}
          <motion.section
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="panel relative col-span-12 flex h-[330px] flex-col overflow-hidden md:h-[470px] xl:col-span-8"
          >
            <div className="pointer-events-none absolute left-0 right-0 top-0 h-px overflow-hidden">
              <div className="sweep h-px w-1/3 bg-gradient-to-r from-transparent via-vio/60 to-transparent" />
            </div>
            <div className="section-head">
              <div className="flex items-center gap-3">
                <div className="section-icon text-vio"><ChartCandlestick size={15} /></div>
                <div>
                  <div className="text-[12px] font-semibold text-zinc-100">Live ETH market</div>
                  <div className="mt-0.5 text-[9px] text-zinc-600">2-hour candles · entries, exits and active levels</div>
                </div>
              </div>
              <div className="ml-auto flex flex-wrap items-center justify-end gap-2.5">
                {lastCandle && (
                  <span className="num hidden text-[9px] text-zinc-600 sm:inline">
                    O <span className="text-zinc-300">{fmtPrice(lastCandle.o)}</span>
                    {" · "}H <span className="text-bull">{fmtPrice(lastCandle.h)}</span>
                    {" · "}L <span className="text-bear">{fmtPrice(lastCandle.l)}</span>
                    {" · "}C <span className="text-zinc-300">{fmtPrice(lastCandle.c)}</span>
                  </span>
                )}
                {data?.market && (
                  <span className="num rounded-full border border-white/7 bg-white/[0.025] px-2.5 py-1 text-[9px] text-zinc-500">
                    ATR <span className="text-zinc-300">{data.market.atrFast.toFixed(1)}</span>
                    {" · "}EMA <span className="text-zinc-300">{fmtPrice(data.market.ema200)}</span>
                  </span>
                )}
                {busy && <span className="friendly-chip text-vio!">Replaying history…</span>}
              </div>
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
                <div className="flex h-full items-end gap-[3px] px-5 pb-6 opacity-60">
                  {Array.from({ length: 46 }).map((_, i) => (
                    <div
                      key={i}
                      className="skeleton flex-1"
                      style={{ height: `${18 + ((i * 37) % 58)}%` }}
                    />
                  ))}
                </div>
              )}
            </div>
          </motion.section>

          {/* right rail */}
          <motion.aside
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="col-span-12 grid content-start gap-3 md:grid-cols-3 xl:col-span-4 xl:grid-cols-1"
          >
            <PositionTicket position={data?.position ?? null} price={data?.price ?? null} />
            <RegimeGauge market={data?.market ?? null} />
            {data && <FiltersAndRisk data={data} />}
          </motion.aside>
        </div>

        {/* performance strip */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-2"
        >
          <div className="flex items-center gap-2 px-1">
            <BarChart3 size={12} className="text-bull" />
            <span className="text-[10px] font-medium text-zinc-400">Performance pulse</span>
            <span className="text-[9px] text-zinc-700">the numbers that matter, at a glance</span>
          </div>
          {data && <StatTiles data={data} />}
        </motion.div>

        <div className="grid grid-cols-12 gap-3">
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
            className="panel col-span-12 h-[350px] overflow-hidden xl:col-span-5"
          >
            <div className="section-head">
              <div className="flex items-center gap-3">
                <div className="section-icon text-amber"><History size={15} /></div>
                <div>
                  <div className="text-[12px] font-semibold text-zinc-100">Trade story</div>
                  <div className="mt-0.5 text-[9px] text-zinc-600">Every closed position, newest first</div>
                </div>
              </div>
              <span className="friendly-chip">{data?.stats.trades ?? 0} chapters</span>
            </div>
            <div className="h-[calc(100%-57px)]">
              <TradesTable trades={data?.trades ?? []} />
            </div>
          </motion.section>
        </div>
      </main>

      <footer className="mx-auto flex w-full max-w-[1640px] flex-wrap items-center justify-between gap-3 px-5 py-5 text-[9px] text-zinc-600 lg:px-7">
        <div className="flex items-center gap-2">
          <div className="grid h-6 w-6 place-items-center rounded-lg bg-vio/8 text-vio">α</div>
          <span>
            $100k paper account · 1–2% risk band · 2× leverage cap · 9% safety stop
          </span>
        </div>
        <span>
          Binance market data · Telegram updates every {data?.heartbeat.mins ?? 30}m · Educational, not financial advice
        </span>
      </footer>

      {/* standby overlay */}
      <AnimatePresence>
        {showStandby && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.4 } }}
            className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink/80 p-4 backdrop-blur-xl"
          >
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
              className="popover-card relative my-4 w-full max-w-[680px] overflow-hidden p-6 text-center sm:p-9"
            >
              <div className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full bg-vio/12 blur-[80px]" />
              <div className="pointer-events-none absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-bull/8 blur-[80px]" />

              <div className="relative mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-gradient-to-br from-vio/20 to-bull/10 shadow-[0_16px_45px_-20px_rgba(139,124,247,0.8)]">
                <Zap size={23} className="fill-vio/20 text-vio" />
                <span className="absolute -right-1 -top-1 rounded-full bg-bull px-1.5 py-0.5 text-[8px] font-bold text-ink">α</span>
              </div>
              <div className="mt-5 text-[10px] font-medium tracking-[0.14em] text-vio">MEET YOUR PAPER TRADING CO-PILOT</div>
              <h1 className="mx-auto mt-3 max-w-lg text-[34px] font-semibold leading-[1.05] tracking-[-0.045em] text-white sm:text-[48px]">
                Patient on quiet days.<br />Ready when ETH moves.
              </h1>
              <p className="mx-auto mt-4 max-w-xl text-[12px] leading-relaxed text-zinc-500">
                Volbreak watches ETHUSDT every two hours, waits for volatility to expand, and manages a virtual $100,000 account with the exact v3.3c rules.
              </p>

              <div className="mx-auto mt-6 grid max-w-[560px] grid-cols-2 gap-2 text-left sm:grid-cols-3">
                {[
                  ["3 market moods", "ATR 1.02 · 1.05 · 1.10"],
                  ["Clear exits", "ATR-native TP and SL"],
                  ["Gentle sizing", "1–2% risk per trade"],
                  ["Safety first", "9% drawdown stop"],
                  ["True costs", "Fees + 10-tick slip"],
                  ["No real money", "Paper mode only"],
                ].map(([k, v]) => (
                  <div key={k} className="mini-surface p-3">
                    <div className="text-[10px] font-medium text-zinc-300">{k}</div>
                    <div className="num mt-1 text-[8.5px] text-zinc-600">{v}</div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => void action("start")}
                disabled={busy}
                className="primary-action mx-auto mt-7 h-11! px-6! text-[11px]!"
              >
                <Play size={13} className="fill-current" />
                {busy ? "Building your two-year story…" : "Start paper trading"}
              </button>
              <p className="mt-3 text-[9px] text-zinc-600">
                First start replays two years of 2H closes, then follows every new candle live.
              </p>
              <button
                onClick={() => setDismissedStandby(true)}
                className="mt-5 text-[10px] text-zinc-600 transition-colors hover:text-zinc-300"
              >
                Look around first →
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
