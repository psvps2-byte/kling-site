import { NextRequest, NextResponse } from "next/server";
import { klingHeaders } from "@/lib/klingAuth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  
  const supabaseAdmin = getSupabaseAdmin();
try {
    const { id } = await ctx.params;

    // Guard: missing / "undefined"
    if (!id || id === "undefined" || id === "null") {
      return NextResponse.json(
        { error: "Missing task id" },
        { status: 400 }
      );
    }

    const base =
      process.env.KLING_API_BASE?.trim() || "https://api-singapore.klingai.com";

    const url = `${base}/v1/videos/motion-control/${encodeURIComponent(id)}`;

    const res = await fetch(url, {
      method: "GET",
      headers: klingHeaders(),
      cache: "no-store",
    });

    const text = await res.text();
    let data: any = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    // If Kling returns error payload, keep it but normalize status
    if (!res.ok) {
      return NextResponse.json(
        {
          error: data?.message || data?.error || "Upstream error",
          upstream_status: res.status,
          upstream: data,
        },
        { status: res.status }
      );
    }

    return NextResponse.json(data, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}
