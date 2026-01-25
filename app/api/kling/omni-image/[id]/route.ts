import { NextResponse } from "next/server";
import { klingHeaders } from "@/lib/klingAuth";

export const runtime = "nodejs";

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;

    const base = process.env.KLING_API_BASE || "https://api-singapore.klingai.com";
    const res = await fetch(`${base}/v1/images/omni-image/${encodeURIComponent(id)}`, {
      method: "GET",
      headers: klingHeaders(),
    });

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.ok ? 200 : res.status });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}