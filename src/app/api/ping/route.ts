import { NextResponse } from "next/server";
import { tickIfNeeded } from "@/lib/engine";

export const dynamic = "force-dynamic";

/**
 * Keep-alive endpoint for an external uptime pinger (UptimeRobot / cron-job.org).
 *
 * Render's free tier suspends a web service after ~15 minutes with no inbound
 * HTTP traffic — and a suspended Node process cannot run timers, so the 24/7
 * autopilot and 30-min Telegram heartbeat stop. An external pinger hitting
 * this cheap route every 10 minutes keeps the instance awake.
 *
 * As a bonus, every ping also nudges the engine, so the strategy advances even
 * if the internal timer were ever lost. No database read on the fast path.
 */
export async function GET() {
  // Fire-and-forget: never make the pinger wait on market data.
  void tickIfNeeded(false);

  return NextResponse.json(
    {
      ok: true,
      ts: Date.now(),
      service: "volbreak-alpha",
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        // Render counts these as real inbound traffic.
        "X-Accel-Buffering": "no",
      },
    }
  );
}
