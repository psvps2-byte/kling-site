import { NextResponse } from "next/server";
import { klingHeaders } from "@/lib/klingAuth";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "Missing task id" }, { status: 400 });
    }

    const base = process.env.KLING_API_BASE || "https://api-singapore.klingai.com";

    // ВАЖЛИВО: шлях має відповідати Kling API (у тебе в логах саме /v1/videos/image2video/{id})
    const res = await fetch(`${base}/v1/videos/image2video/${encodeURIComponent(id)}`, {
      method: "GET",
      headers: klingHeaders(),
    });

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.ok ? 200 : res.status });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
