import { NextResponse } from "next/server";
import {
  setHeartbeatMins,
  HEARTBEAT_MAX_BOUND,
  DEFAULT_HEARTBEAT_MINS,
} from "@/lib/engine";

export const dynamic = "force-dynamic";

/** PATCH: { heartbeatMins: number }  — 0 disables position heartbeats. */
export async function PATCH(req: Request) {
  try {
    const body = (await req.json()) as { heartbeatMins?: unknown };
    const raw = Number(body.heartbeatMins);

    if (!Number.isFinite(raw) || raw < 0 || raw > HEARTBEAT_MAX_BOUND) {
      return NextResponse.json(
        { ok: false, error: `heartbeatMins must be 0–${HEARTBEAT_MAX_BOUND}` },
        { status: 400 }
      );
    }

    const mins = await setHeartbeatMins(raw === 0 ? 0 : Math.max(1, raw));
    return NextResponse.json({
      ok: true,
      heartbeatMins: mins,
      disabled: mins === 0,
      default: DEFAULT_HEARTBEAT_MINS,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "settings update failed" },
      { status: 500 }
    );
  }
}
