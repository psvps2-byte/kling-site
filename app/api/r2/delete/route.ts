import { NextResponse } from "next/server";
import { deleteFromR2 } from "@/lib/r2";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const key = String(body?.key || "");

    if (!key) {
      return NextResponse.json({ error: "Missing key" }, { status: 400 });
    }

    await deleteFromR2(key);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Delete error" }, { status: 500 });
  }
}
