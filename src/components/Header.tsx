"use client";

import { Play, Pause, RotateCcw, ArrowUpRight, ArrowDownRight, Server, Bell, X, Heart } from "lucide-react";
import type { DashboardPayload } from "@/lib/engine";
import { CFG } from "@/lib/strategy";
import { fmtClock, fmtCountdown, fmtPct, fmtPrice } from "@/lib/format";
import { useEffect, useRef, useState } from "react";

type NotifyState = "idle" | "sending" | "ok" | "fail";

type Props = {
  data: DashboardPayload | null;
  now: number;
  busy: boolean;
  onAction: (a: "start" | "pause" | "reset") => void;
  notifyState: NotifyState;
  notifyError: string | null;
  onTestNotify: () => void;
};

function StatusPill({ data }: { data: DashboardPayload | null }) {
  if (!data) return null;
  if (data.killSwitch) {
    return (
      <div className="flex items-center gap-2 rounded-full border border-bear/40 bg-bear/10 px-3 py-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-bear kill-glow" />
        <span className="label text-bear!">Kill switch</span>
      </div>
    );
  }
  if (data.running) {
    return (
      <div className="flex items-center gap-2 rounded-full border border-bull/30 bg-bull/8 px-3 py-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-bull pulse-dot" />
        <span className="label text-bull!">Engine live</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/4 px-3 py-1.5">
      <span className="h-1.5 w-1.5 rounded-full bg-amber pulse-amber" />
      <span className="label text-amber!">Standby</span>
    </div>
  );
}

export default function Header({ data, now, busy, onAction, notifyState, notifyError, onTestNotify }: Props) {
  const [alertsOpen, setAlertsOpen] = useState(false);
  const tg = data?.telegram ?? null;
  const price = data?.price ?? null;
  const prevPrice = useRef<number | null>(null);
  const [flash, setFlash] = useState<"" | "flash-up" | "flash-down">("");

  useEffect(() => {
    if (price === null) return;
    if (prevPrice.current !== null && price !== prevPrice.current) {
      setFlash(price > prevPrice.current ? "flash-up" : "flash-down");
      const t = setTimeout(() => setFlash(""), 750);
      return () => clearTimeout(t);
    }
    prevPrice.current = price;
  }, [price]);

  useEffect(() => {
    if (price !== null) prevPrice.current = price;
  }, [price, flash]);

  const chg = data?.ticker?.changePct ?? null;
  const nextClose =
    Math.floor(now / CFG.intervalMs) * CFG.intervalMs + CFG.intervalMs;
  const msLeft = Math.max(0, nextClose - now);
  const progress = 1 - msLeft / CFG.intervalMs;

  return (
    <header className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-line px-4 py-3 lg:px-6">
      {/* brand */}
      <div className="flex items-center gap-3">
        <div className="relative grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-gradient-to-br from-white/8 to-transparent">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              d="M13 2L4.5 13.5H11L9.5 22L19.5 9.5H12.5L13 2Z"
              fill="url(#lg1)"
              stroke="rgba(255,255,255,0.35)"
              strokeWidth="0.6"
            />
            <defs>
              <linearGradient id="lg1" x1="4" y1="2" x2="20" y2="22">
                <stop stopColor="#35f2a6" />
                <stop offset="1" stopColor="#8b7cf7" />
              </linearGradient>
            </defs>
          </svg>
          <span className="absolute inset-0 -z-10 rounded-lg bg-vio/20 blur-md" />
        </div>
        <div className="leading-tight">
          <div className="text-[15px] font-semibold tracking-wide">
            VOLBREAK <span className="text-vio">α</span>
          </div>
          <div className="label mt-0.5 text-[9px]!">
            Adaptive Volatility Breakout · v3.3c
          </div>
        </div>
      </div>

      {/* symbol */}
      <div className="flex items-center gap-2">
        <span className="rounded-md border border-white/10 bg-white/4 px-2.5 py-1 text-[11px] font-semibold tracking-widest text-zinc-200">
          ETHUSDT
        </span>
        <span className="label rounded-md border border-white/8 px-2 py-1">2H</span>
        <span className="label hidden rounded-md border border-vio/25 bg-vio/8 px-2 py-1 text-vio! xl:inline">
          Binance paper
        </span>
      </div>

      {/* live price */}
      <div className="flex items-baseline gap-2.5">
        <span className={`num text-2xl font-medium ${flash}`}>
          {price !== null ? `$${fmtPrice(price)}` : "——"}
        </span>
        {chg !== null && (
          <span
            className={`num flex items-center gap-0.5 text-xs ${
              chg >= 0 ? "text-bull" : "text-bear"
            }`}
          >
            {chg >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
            {fmtPct(chg)}
          </span>
        )}
      </div>

      <div className="mx-auto hidden h-6 w-px bg-line lg:block" />

      {/* next bar countdown */}
      <div className="hidden items-center gap-3 md:flex">
        <div className="leading-tight">
          <div className="label text-[9px]!">Next 2H bar close</div>
          <div className="num mt-0.5 text-sm text-zinc-200">{fmtCountdown(msLeft)}</div>
        </div>
        <div className="relative h-1 w-20 overflow-hidden rounded-full bg-white/8">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-vio to-bull transition-[width] duration-1000"
            style={{ width: `${(progress * 100).toFixed(1)}%` }}
          />
        </div>
      </div>

      {/* clock */}
      <div className="hidden leading-tight xl:block">
        <div className="label text-[9px]!">UTC</div>
        <div className="num mt-0.5 text-sm text-zinc-300">{fmtClock(now)}</div>
      </div>

      <StatusPill data={data} />

      {data?.running && data.autopilot.active && (
        <span
          className="label hidden items-center gap-1.5 rounded-full border border-vio/25 bg-vio/8 px-2.5 py-1 text-vio! md:flex"
          title={`Server-side scheduler — last wake ${data.autopilot.lastWake ? new Date(data.autopilot.lastWake).toISOString() : "—"}`}
        >
          <Server size={11} />
          Autopilot 24/7
        </span>
      )}

      {data?.running && (
        <span
          className="label hidden items-center gap-1.5 rounded-full border border-white/8 bg-white/3 px-2.5 py-1 text-zinc-400! lg:flex"
          title={
            data.telegram.lastHeartbeatAt
              ? `Last Telegram heartbeat sent ${fmtClock(data.telegram.lastHeartbeatAt)} UTC (${data.telegram.heartbeatsSent} this session)`
              : "First heartbeat pending — counts down from server boot"
          }
        >
          <Heart size={11} className={data.telegram.lastHeartbeatAt ? "text-bull" : "text-zinc-600"} />
          30m ping
          <span className="num text-[9px] text-zinc-200">
            {data.heartbeat.nextAt
              ? fmtCountdown(data.heartbeat.nextAt - now)
              : "—"}
          </span>
        </span>
      )}

      {/* telegram alerts */}
      {data && (
        <div className="relative">
          <button
            onClick={() => (tg?.configured ? onTestNotify() : setAlertsOpen((v) => !v))}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 transition-colors ${
              notifyState === "ok"
                ? "border-bull/40 bg-bull/10 text-bull"
                : notifyState === "fail" || tg?.lastError
                  ? "border-bear/40 bg-bear/10 text-bear"
                  : tg?.configured
                    ? "border-white/12 bg-white/4 text-zinc-300 hover:border-white/25"
                    : "border-white/10 bg-white/3 text-zinc-500 hover:border-white/20 hover:text-zinc-300"
            }`}
            title={
              notifyError
                ? `Last send failed: ${notifyError}`
                : tg?.configured
                  ? "Send a test alert to your Telegram"
                  : "Set up Telegram alerts"
            }
          >
            <Bell size={11} className={tg?.configured && !tg.lastError ? "text-bull" : ""} />
            <span className="label text-inherit!">
              {notifyState === "sending"
                ? "Sending…"
                : notifyState === "ok"
                  ? "Sent ✓"
                  : tg?.configured
                    ? "TG alerts"
                    : "Alerts"}
            </span>
          </button>

          {alertsOpen && !tg?.configured && (
            <div className="absolute right-0 top-full z-50 mt-2 w-[320px] rounded-xl border border-white/12 bg-panel2 p-4 shadow-2xl shadow-black/60">
              <div className="flex items-center justify-between">
                <span className="label text-zinc-300!">Phone alerts via Telegram</span>
                <button onClick={() => setAlertsOpen(false)} className="text-zinc-500 hover:text-zinc-200">
                  <X size={13} />
                </button>
              </div>
              <ol className="num mt-3 list-decimal space-y-2 pl-4 text-[11px] leading-relaxed text-zinc-400">
                <li>In Telegram, message <span className="text-zinc-100">@BotFather</span> → <span className="text-zinc-100">/newbot</span> and copy the token.</li>
                <li>Message your new bot once (any text) so it can reach you.</li>
                <li>Open <span className="text-zinc-100">api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</span> and find <span className="text-zinc-100">"chat":{"{"}id":…</span></li>
                <li>
                  Add sandbox secrets:
                  <div className="mt-1.5 rounded-md border border-white/10 bg-black/40 px-2.5 py-2 text-[10px] text-vio">
                    TELEGRAM_BOT_TOKEN=123456:ABC…
                    <br />
                    TELEGRAM_CHAT_ID=123456789
                  </div>
                </li>
                <li>Restart — this chip turns green. Click it to send a test alert.</li>
              </ol>
              <button
                onClick={() => setAlertsOpen(false)}
                className="label mt-3 w-full rounded-md border border-white/10 py-1.5 text-zinc-400! hover:text-zinc-200"
              >
                Got it
              </button>
            </div>
          )}
        </div>
      )}

      {/* controls */}
      <div className="flex items-center gap-2">
        {data && !data.running ? (
          <button
            disabled={busy}
            onClick={() => onAction("start")}
            className="group flex items-center gap-2 rounded-lg border border-bull/40 bg-bull/12 px-4 py-2 text-[11px] font-semibold tracking-[0.15em] text-bull transition-all hover:bg-bull/20 hover:shadow-[0_0_24px_rgba(53,242,166,0.25)] disabled:opacity-40"
          >
            <Play size={13} className="fill-current" />
            {data.killSwitch ? "RESUME" : data.neverRan ? "START ENGINE" : "START"}
          </button>
        ) : (
          <button
            disabled={busy}
            onClick={() => onAction("pause")}
            className="flex items-center gap-2 rounded-lg border border-amber/40 bg-amber/10 px-4 py-2 text-[11px] font-semibold tracking-[0.15em] text-amber transition-all hover:bg-amber/20 disabled:opacity-40"
          >
            <Pause size={13} className="fill-current" />
            PAUSE
          </button>
        )}
        <button
          disabled={busy}
          onClick={() => {
            if (window.confirm("Reset paper account to $100,000 and clear all trades?"))
              onAction("reset");
          }}
          className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/4 px-3 py-2 text-[11px] font-semibold tracking-[0.15em] text-zinc-400 transition-all hover:border-white/20 hover:text-zinc-200 disabled:opacity-40"
        >
          <RotateCcw size={12} />
          RESET
        </button>
      </div>
    </header>
  );
}
