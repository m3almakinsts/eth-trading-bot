import { NextResponse } from "next/server";
import { control } from "@/lib/engine";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { action?: string };
    const action = body.action;
    if (action !== "start" && action !== "pause" && action !== "reset") {
      return NextResponse.json({ ok: false, error: "invalid action" }, { status: 400 });
    }
    await control(action);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "control failed" },
      { status: 500 }
    );
  }
}
