import { NextResponse } from "next/server";
import { sendHeartbeat } from "@/lib/engine";
import { telegramConfigured } from "@/lib/notify";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!telegramConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID secrets first" },
      { status: 400 }
    );
  }
  const res = await sendHeartbeat();
  return NextResponse.json(res, { status: res.ok ? 200 : 502 });
}
