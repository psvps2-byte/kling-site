import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAdminReferralSummary, updateWithdrawalRequestStatus } from "@/lib/referrals";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function checkAdmin(req: NextRequest) {
  const password = req.headers.get("x-admin-password") || "";
  const expected = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || "";
  return !!expected && password === expected;
}

export async function GET(req: NextRequest) {
  if (!checkAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const data = await getAdminReferralSummary(supabase);
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest) {
  if (!checkAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const requestId = String(body?.requestId || "").trim();
  const status = String(body?.status || "").trim().toUpperCase();

  if (!requestId || !status) {
    return NextResponse.json({ error: "requestId and status are required" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    await updateWithdrawalRequestStatus(supabase, requestId, status);
    const data = await getAdminReferralSummary(supabase);
    return NextResponse.json({ ok: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Server error";
    if (
      message === "invalid_status" ||
      message === "request_not_found" ||
      message === "paid_request_is_final" ||
      message === "not_enough_points_to_restore_request"
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error("admin/referrals patch error", error);
    return NextResponse.json({ error: "Failed to update withdrawal request" }, { status: 500 });
  }
}
