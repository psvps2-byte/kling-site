import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  createVisitorToken,
  REFERRAL_COOKIE,
  REFERRAL_VISITOR_COOKIE,
  trackReferralVisit,
} from "@/lib/referrals";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const code = String(body?.code || "").trim().toLowerCase();
  const landingPath = String(body?.landingPath || "").trim();

  if (!code) {
    return NextResponse.json({ ok: false, error: "Referral code is required" }, { status: 400 });
  }

  const visitorToken = req.cookies.get(REFERRAL_VISITOR_COOKIE)?.value || createVisitorToken();
  const supabase = getSupabaseAdmin();
  const result = await trackReferralVisit(supabase, code, visitorToken, landingPath || undefined);

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: "Referral code not found" }, { status: 404 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(REFERRAL_COOKIE, code, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  res.cookies.set(REFERRAL_VISITOR_COOKIE, visitorToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
