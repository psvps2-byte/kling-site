import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createWithdrawalRequest, getReferralOverview } from "@/lib/referrals";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AdminSupabase = ReturnType<typeof getSupabaseAdmin>;

async function getCurrentUser(supabase: AdminSupabase, email: string) {
  const { data: user, error } = await supabase
    .from("users")
    .select("id, email, name, points, referral_code, referred_by")
    .eq("email", email)
    .single();

  if (error || !user?.id) {
    throw new Error("user_not_found");
  }

  return user;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const email = String(session?.user?.email || "").trim();
  if (!email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser(supabase, email);
  const overview = await getReferralOverview(supabase, user, req.nextUrl.origin);
  return NextResponse.json(overview);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const email = String(session?.user?.email || "").trim();
  if (!email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const cardNumber = String(body?.cardNumber || "").trim();
  if (!cardNumber) {
    return NextResponse.json({ error: "Card number is required" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const user = await getCurrentUser(supabase, email);
    const requestRow = await createWithdrawalRequest(supabase, user, cardNumber);
    const overview = await getReferralOverview(supabase, { ...user, points: user.points - requestRow.requestedPoints }, req.nextUrl.origin);
    return NextResponse.json({ ok: true, request: requestRow, overview });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Server error";
    if (message === "invalid_card_number") {
      return NextResponse.json({ error: "Invalid card number" }, { status: 400 });
    }
    if (message === "not_enough_withdrawable_points") {
      return NextResponse.json({ error: "Not enough withdrawable points" }, { status: 400 });
    }
    if (message === "not_enough_points") {
      return NextResponse.json({ error: "Not enough points on balance" }, { status: 400 });
    }
    console.error("withdraw/create error", error);
    return NextResponse.json({ error: "Failed to create withdrawal request" }, { status: 500 });
  }
}
