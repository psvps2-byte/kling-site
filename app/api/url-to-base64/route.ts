import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function noStoreJson(data: any, init?: { status?: number }) {
  return NextResponse.json(data, {
    status: init?.status ?? 200,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
      "Surrogate-Control": "no-store",
    },
  });
}

function asString(v: any) {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const email = asString(session?.user?.email).trim();
    if (!email) return noStoreJson({ error: "Not authenticated" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const url = asString(body?.url).trim();
    if (!url) return noStoreJson({ error: "Missing url" }, { status: 400 });
    if (!/^https?:\/\//i.test(url)) return noStoreJson({ error: "Invalid url" }, { status: 400 });

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return noStoreJson({ error: `Failed to fetch (${res.status})` }, { status: 400 });

    const buf = Buffer.from(await res.arrayBuffer());
    const base64 = buf.toString("base64");

    return noStoreJson({ base64 });
  } catch (e: any) {
    return noStoreJson(
      { error: "Server error", details: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
