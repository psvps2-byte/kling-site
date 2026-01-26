import { NextResponse } from "next/server";
import { klingHeaders } from "@/lib/klingAuth";

export const runtime = "nodejs";

export async function GET() {
  
const headers = klingHeaders();
  const token = headers.Authorization?.replace("Bearer ", "") || "";

  return NextResponse.json({
    parts: token.split(".").filter(Boolean).length,
    preview: token.slice(0, 25),
    hasAuth: Boolean(headers.Authorization),
  });
}
