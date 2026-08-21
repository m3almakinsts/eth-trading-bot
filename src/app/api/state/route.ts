import { NextResponse } from "next/server";
import { getDashboard } from "@/lib/engine";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const payload = await getDashboard();
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "state failed" },
      { status: 500 }
    );
  }
}
