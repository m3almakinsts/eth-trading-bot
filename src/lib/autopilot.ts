/**
 * Server-side autopilot: keeps the paper engine advancing even when no
 * browser tab is open. Started once from Next's `instrumentation` hook when
 * the Node server boots, then wakes every 30s to process any 2H candle that
 * closed since the last run, and sends a position heartbeat to Telegram on
 * the user-configured cadence.
 */
import { tickIfNeeded, sendHeartbeat, getHeartbeatMins } from "./engine";

const g = globalThis as typeof globalThis & {
  __vbAutopilot?: ReturnType<typeof setInterval>;
  __vbAutopilotWake?: { wakes: number; lastWake: number };
  __vbLastHeartbeat?: number;
  __vbBootAt?: number;
};

function maybeHeartbeat(): void {
  const mins = getHeartbeatMins();
  if (mins <= 0) return; // heartbeats disabled
  const intervalMs = mins * 60_000;
  const now = Date.now();
  if (now - (g.__vbLastHeartbeat ?? 0) >= intervalMs) {
    g.__vbLastHeartbeat = now;
    void sendHeartbeat();
  }
}

export function startAutopilot(): void {
  if (g.__vbAutopilot) return;

  g.__vbAutopilotWake = g.__vbAutopilotWake ?? { wakes: 0, lastWake: 0 };
  g.__vbLastHeartbeat = g.__vbLastHeartbeat ?? 0;
  g.__vbBootAt = g.__vbBootAt ?? Date.now();

  // Wake frequently; `tickIfNeeded` short-circuits cheaply unless a new
  // 2H close is pending.
  g.__vbAutopilot = setInterval(() => {
    void tickIfNeeded(false);
    maybeHeartbeat();
  }, 30_000);

  (g.__vbAutopilot as unknown as { unref?: () => void }).unref?.();

  // Immediate catch-up pass on server boot (covers any downtime gap).
  void tickIfNeeded(true);

  // Send an initial heartbeat shortly after boot, proving the loop is live.
  // Allow a grace period for the boot tick to populate market data.
  setTimeout(maybeHeartbeat, 8000);
}
