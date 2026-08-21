/**
 * Server-side autopilot: keeps the paper engine advancing even when no
 * browser tab is open. Started once from Next's `instrumentation` hook when
 * the Node server boots, then wakes every 30s to process any 2H candle that
 * closed since the last run. Also sends a 30-minute position & tape heartbeat
 * to Telegram.
 */
import { tickIfNeeded, sendHeartbeat } from "./engine";

const HEARTBEAT_INTERVAL_MS = 30 * 60 * 1000; // 30 mins

const g = globalThis as typeof globalThis & {
  __vbAutopilot?: ReturnType<typeof setInterval>;
  __vbAutopilotWake?: { wakes: number; lastWake: number };
  __vbLastHeartbeat?: number;
};

export function startAutopilot(): void {
  if (g.__vbAutopilot) return;

  g.__vbAutopilotWake = g.__vbAutopilotWake ?? { wakes: 0, lastWake: 0 };
  g.__vbLastHeartbeat = g.__vbLastHeartbeat ?? 0;

  // Wake frequently; `tickIfNeeded` short-circuits cheaply unless a new
  // 2H close is pending.
  g.__vbAutopilot = setInterval(async () => {
    void tickIfNeeded(false);

    const now = Date.now();
    if (now - (g.__vbLastHeartbeat ?? 0) >= HEARTBEAT_INTERVAL_MS) {
      g.__vbLastHeartbeat = now;
      void sendHeartbeat();
    }
  }, 30_000);

  (g.__vbAutopilot as unknown as { unref?: () => void }).unref?.();

  // Immediate catch-up pass on server boot (covers any downtime gap).
  void tickIfNeeded(true);

  // Send an initial heartbeat 4s after boot once initial tick resolves
  setTimeout(() => {
    const now = Date.now();
    if (now - (g.__vbLastHeartbeat ?? 0) >= HEARTBEAT_INTERVAL_MS - 60000 || g.__vbLastHeartbeat === 0) {
      g.__vbLastHeartbeat = now;
      void sendHeartbeat();
    }
  }, 4000);
}
