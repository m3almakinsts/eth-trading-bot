"use client";

import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  Bot,
  ChevronDown,
  Clock3,
  Heart,
  Pause,
  Play,
  RotateCcw,
  Send,
  Server,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
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
  onRefresh: () => void;
};

const HB_PRESETS: Array<{ label: string; mins: number }> = [
  { label: "15 min", mins: 15 },
  { label: "30 min", mins: 30 },
  { label: "1 hour", mins: 60 },
  { label: "2 hours", mins: 120 },
  { label: "4 hours", mins: 240 },
  { label: "Off", mins: 0 },
];

function StatusPill({ data }: { data: DashboardPayload | null }) {
  if (!data) {
    return (
      <div className="system-pill text-zinc-500">
        <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" /> Connecting
      </div>
    );
  }
  if (data.killSwitch) {
    return (
      <div className="system-pill border-bear/25! bg-bear/8! text-bear">
        <span className="h-1.5 w-1.5 rounded-full bg-bear kill-glow" /> Safety stop
      </div>
    );
  }
  if (data.running) {
    return (
      <div className="system-pill border-bull/20! bg-bull/7! text-bull">
        <span className="h-1.5 w-1.5 rounded-full bg-bull pulse-dot" /> Trading live
      </div>
    );
  }
  return (
    <div className="system-pill border-amber/20! bg-amber/7! text-amber">
      <span className="h-1.5 w-1.5 rounded-full bg-amber pulse-amber" /> Taking a break
    </div>
  );
}

function PopoverShell({
  children,
  onClose,
  title,
  icon,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="popover-card absolute left-0 top-full z-50 mt-2 w-[min(320px,calc(100vw-24px))] p-4 sm:left-auto sm:right-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-vio/10 text-vio">{icon}</span>
          <span className="text-[12px] font-semibold text-zinc-100">{title}</span>
        </div>
        <button
          onClick={onClose}
          className="grid h-7 w-7 place-items-center rounded-lg text-zinc-500 transition-colors hover:bg-white/5 hover:text-white"
          aria-label="Close"
        >
          <X size={14} />
        </button>
      </div>
      {children}
    </div>
  );
}

export default function Header({
  data,
  now,
  busy,
  onAction,
  notifyState,
  notifyError,
  onTestNotify,
  onRefresh,
}: Props) {
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [hbOpen, setHbOpen] = useState(false);
  const [hbSaving, setHbSaving] = useState(false);
  const [hbInput, setHbInput] = useState("30");
  const tg = data?.telegram ?? null;

  const applyHb = async (mins: number) => {
    setHbSaving(true);
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ heartbeatMins: mins }),
      });
      setHbInput(String(mins));
      onRefresh();
    } finally {
      setHbSaving(false);
    }
  };

  const price = data?.price ?? null;
  const prevPrice = useRef<number | null>(null);
  const [flash, setFlash] = useState<"" | "flash-up" | "flash-down">("");

  useEffect(() => {
    if (price === null) return;
    if (prevPrice.current !== null && price !== prevPrice.current) {
      setFlash(price > prevPrice.current ? "flash-up" : "flash-down");
      const t = setTimeout(() => setFlash(""), 750);
      prevPrice.current = price;
      return () => clearTimeout(t);
    }
    prevPrice.current = price;
  }, [price]);

  const chg = data?.ticker?.changePct ?? null;
  const nextClose = Math.floor(now / CFG.intervalMs) * CFG.intervalMs + CFG.intervalMs;
  const msLeft = Math.max(0, nextClose - now);
  const progress = 1 - msLeft / CFG.intervalMs;

  return (
    <header className="sticky top-0 z-40 border-b border-white/6 bg-ink/72 backdrop-blur-2xl">
      <div className="mx-auto max-w-[1640px] px-3 py-3 sm:px-5 lg:px-7">
        {/* Primary navigation */}
        <div className="flex flex-wrap items-center gap-3 lg:gap-5">
          <div className="mr-auto flex min-w-0 items-center gap-3">
            <div className="brand-mark">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M13 2L4.5 13.5H11L9.5 22L19.5 9.5H12.5L13 2Z"
                  fill="url(#brand-gradient)"
                  stroke="rgba(255,255,255,0.5)"
                  strokeWidth="0.5"
                />
                <defs>
                  <linearGradient id="brand-gradient" x1="4" y1="2" x2="20" y2="22">
                    <stop stopColor="#6EF4B8" />
                    <stop offset="0.52" stopColor="#A39AFB" />
                    <stop offset="1" stopColor="#FF87A0" />
                  </linearGradient>
                </defs>
              </svg>
              <span className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full border border-ink bg-vio text-[8px] font-bold text-white">
                α
              </span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-[16px] font-semibold tracking-[-0.02em] text-white">
                  Volbreak
                </span>
                <span className="rounded-full bg-white/5 px-2 py-0.5 text-[8px] font-semibold tracking-[0.14em] text-zinc-500">
                  v3.3c
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-zinc-500">
                <Sparkles size={10} className="text-vio" /> Your adaptive ETH paper desk
              </div>
            </div>
          </div>

          {/* Market snapshot */}
          <div className="market-snapshot order-3 w-full sm:order-none sm:w-auto">
            <div className="flex items-center gap-2 border-r border-white/8 pr-3">
              <div className="coin-orb">Ξ</div>
              <div>
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-200">
                  ETH <span className="text-zinc-600">/</span> USDT
                </div>
                <div className="text-[9px] text-zinc-600">Binance · 2 hour</div>
              </div>
            </div>
            <div className="pl-1">
              <div className={`num text-[20px] font-medium leading-none text-zinc-50 ${flash}`}>
                {price !== null ? `$${fmtPrice(price)}` : "—"}
              </div>
              {chg !== null && (
                <div
                  className={`num mt-1 flex items-center gap-0.5 text-[10px] ${
                    chg >= 0 ? "text-bull" : "text-bear"
                  }`}
                >
                  {chg >= 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                  {fmtPct(chg)} today
                </div>
              )}
            </div>
          </div>

          {/* Main controls */}
          <div className="flex items-center gap-2">
            {data && !data.running ? (
              <button
                disabled={busy}
                onClick={() => onAction("start")}
                className="primary-action"
              >
                <Play size={13} className="fill-current" />
                {data.killSwitch ? "Resume" : data.neverRan ? "Start bot" : "Start"}
              </button>
            ) : (
              <button
                disabled={busy}
                onClick={() => onAction("pause")}
                className="secondary-action border-amber/20! text-amber! hover:bg-amber/8!"
              >
                <Pause size={13} className="fill-current" /> Pause
              </button>
            )}
            <button
              disabled={busy}
              onClick={() => {
                if (window.confirm("Reset paper account to $100,000 and clear all trades?")) {
                  onAction("reset");
                }
              }}
              className="icon-action"
              title="Reset paper account"
              aria-label="Reset paper account"
            >
              <RotateCcw size={13} />
            </button>
          </div>
        </div>

        {/* Systems rail */}
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/5 pt-2.5">
          <StatusPill data={data} />

          <div className="system-pill min-w-[174px] gap-2.5!">
            <Clock3 size={11} className="text-vio" />
            <span className="text-zinc-500">Next bar</span>
            <span className="num ml-auto text-zinc-200">{fmtCountdown(msLeft)}</span>
            <span className="relative h-1 w-12 overflow-hidden rounded-full bg-white/7">
              <span
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-vio to-bull transition-[width] duration-1000"
                style={{ width: `${(progress * 100).toFixed(1)}%` }}
              />
            </span>
          </div>

          {data?.running && data.autopilot.active && (
            <div
              className="system-pill hidden border-vio/15! bg-vio/5! text-vio sm:flex"
              title={`Last server wake: ${data.autopilot.lastWake ? new Date(data.autopilot.lastWake).toISOString() : "—"}`}
            >
              <Server size={11} /> Always-on autopilot
            </div>
          )}

          {/* Heartbeat editor */}
          {data?.running && (
            <div className="relative">
              <button
                onClick={() => {
                  setHbInput(String(data.heartbeat.mins));
                  setHbOpen((v) => !v);
                  setAlertsOpen(false);
                }}
                className="system-pill group text-zinc-400 hover:border-white/15! hover:text-zinc-100"
              >
                <Heart
                  size={11}
                  className={data.telegram.lastHeartbeatAt ? "fill-bull/20 text-bull" : "text-zinc-600"}
                />
                <span>{data.heartbeat.mins > 0 ? `Update every ${data.heartbeat.mins}m` : "Updates off"}</span>
                <span className="num text-zinc-200">
                  {data.heartbeat.mins > 0 && data.heartbeat.nextAt
                    ? fmtCountdown(data.heartbeat.nextAt - now)
                    : "—"}
                </span>
                <ChevronDown size={10} className="text-zinc-600 transition-transform group-hover:translate-y-0.5" />
              </button>

              {hbOpen && (
                <PopoverShell
                  title="Position updates"
                  icon={<SlidersHorizontal size={14} />}
                  onClose={() => setHbOpen(false)}
                >
                  <p className="mt-3 text-[11px] leading-relaxed text-zinc-500">
                    Choose how often Telegram sends a friendly snapshot of your open position and account.
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-1.5">
                    {HB_PRESETS.map((p) => (
                      <button
                        key={p.label}
                        disabled={hbSaving}
                        onClick={() => void applyHb(p.mins)}
                        className={`rounded-lg border px-2.5 py-2 text-[11px] transition-all disabled:opacity-40 ${
                          data.heartbeat.mins === p.mins
                            ? "border-bull/35 bg-bull/10 text-bull"
                            : "border-white/8 bg-white/[0.025] text-zinc-400 hover:border-white/16 hover:bg-white/5 hover:text-white"
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/8 bg-black/20 p-1.5">
                    <input
                      type="number"
                      min={0}
                      max={240}
                      value={hbInput}
                      disabled={hbSaving}
                      onChange={(e) => setHbInput(e.target.value)}
                      className="num min-w-0 flex-1 bg-transparent px-2 text-[12px] text-white outline-none"
                      aria-label="Custom interval in minutes"
                    />
                    <span className="text-[10px] text-zinc-600">minutes</span>
                    <button
                      disabled={hbSaving}
                      onClick={() => void applyHb(Number(hbInput))}
                      className="rounded-lg bg-vio px-3 py-1.5 text-[10px] font-semibold text-white transition-transform hover:-translate-y-px disabled:opacity-40"
                    >
                      {hbSaving ? "Saving" : "Apply"}
                    </button>
                  </div>
                  <div className="mt-2 text-[9px] text-zinc-600">1–240 minutes · 0 turns updates off · saved automatically</div>
                </PopoverShell>
              )}
            </div>
          )}

          {/* Telegram */}
          {data && (
            <div className="relative">
              <button
                onClick={() => {
                  if (tg?.configured) onTestNotify();
                  else setAlertsOpen((v) => !v);
                  setHbOpen(false);
                }}
                className={`system-pill transition-all ${
                  notifyState === "ok"
                    ? "border-bull/25! bg-bull/8! text-bull"
                    : notifyState === "fail" || tg?.lastError
                      ? "border-bear/25! bg-bear/8! text-bear"
                      : tg?.configured
                        ? "text-zinc-300 hover:border-bull/20! hover:text-bull"
                        : "text-zinc-500 hover:border-white/15! hover:text-white"
                }`}
                title={notifyError ? `Last send failed: ${notifyError}` : "Send a Telegram test alert"}
              >
                <Send size={11} />
                {notifyState === "sending"
                  ? "Sending…"
                  : notifyState === "ok"
                    ? "Test sent ✓"
                    : tg?.configured
                      ? "Telegram ready"
                      : "Connect Telegram"}
              </button>

              {alertsOpen && !tg?.configured && (
                <PopoverShell
                  title="Phone alerts"
                  icon={<Bell size={14} />}
                  onClose={() => setAlertsOpen(false)}
                >
                  <div className="mt-3 space-y-2.5 text-[11px] leading-relaxed text-zinc-500">
                    <p><b className="text-zinc-200">1.</b> Message <span className="text-zinc-200">@BotFather</span>, run <span className="num text-vio">/newbot</span>, and copy the token.</p>
                    <p><b className="text-zinc-200">2.</b> Send your new bot any message so it can reach you.</p>
                    <p><b className="text-zinc-200">3.</b> Add these two server secrets, then restart:</p>
                    <div className="num rounded-xl border border-white/8 bg-black/25 p-3 text-[9px] leading-relaxed text-vio">
                      TELEGRAM_BOT_TOKEN=123456:ABC…<br />
                      TELEGRAM_CHAT_ID=123456789
                    </div>
                  </div>
                </PopoverShell>
              )}
            </div>
          )}

          <div className="system-pill ml-auto hidden text-zinc-500 sm:flex">
            <Activity size={11} /> UTC <span className="num text-zinc-300">{fmtClock(now)}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
