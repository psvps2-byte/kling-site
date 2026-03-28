export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase";
import { authOptions } from "@/lib/auth";
import {
  attachReferralToUser,
  getReferralOverview,
  REFERRAL_COOKIE,
  REFERRAL_VISITOR_COOKIE,
} from "@/lib/referrals";

export async function GET() {
  const supabaseAdmin = getSupabaseAdmin();
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    const res = NextResponse.json({ authenticated: false }, { status: 401 });
    res.headers.set("Cache-Control", "no-store");
    return res;
  }

  const email = session.user.email;
  const name = session.user.name ?? null;
  const avatar_url = (session.user as { image?: string | null }).image ?? null;

  // 1) знайти користувача
  const { data: existing, error: selectErr } = await supabaseAdmin
    .from("users")
    .select("id,email,name,avatar_url,points,role,created_at,referral_code,referred_by,referred_at")
    .eq("email", email)
    .maybeSingle();

  if (selectErr) {
    const res = NextResponse.json({ error: selectErr.message }, { status: 500 });
    res.headers.set("Cache-Control", "no-store");
    return res;
  }

  // 2) якщо нема — створити
  if (!existing) {
    const { data: created, error: insertErr } = await supabaseAdmin
      .from("users")
      .insert([{ email, name, avatar_url, points: 0 }])
      .select("id,email,name,avatar_url,points,role,created_at,referral_code,referred_by,referred_at")
      .single();

    if (insertErr) {
      const res = NextResponse.json({ error: insertErr.message }, { status: 500 });
      res.headers.set("Cache-Control", "no-store");
      return res;
    }

    const cookieStore = await cookies();
    await attachReferralToUser(
      supabaseAdmin,
      created,
      cookieStore.get(REFERRAL_COOKIE)?.value,
      cookieStore.get(REFERRAL_VISITOR_COOKIE)?.value
    );

    const refreshedUser = {
      ...created,
      referred_by: created.referred_by,
    };
    const referral = await getReferralOverview(supabaseAdmin, refreshedUser);
    const res = NextResponse.json({ authenticated: true, user: { ...created, referral } });
    res.headers.set("Cache-Control", "no-store");
    return res;
  }

  const cookieStore = await cookies();
  await attachReferralToUser(
    supabaseAdmin,
    existing,
    cookieStore.get(REFERRAL_COOKIE)?.value,
    cookieStore.get(REFERRAL_VISITOR_COOKIE)?.value
  );

  const { data: userWithReferral } = await supabaseAdmin
    .from("users")
    .select("id,email,name,avatar_url,points,role,created_at,referral_code,referred_by,referred_at")
    .eq("id", existing.id)
    .single();

  const finalUser = userWithReferral || existing;
  const referral = await getReferralOverview(supabaseAdmin, finalUser);

  // 3) якщо є — повернути
  const res = NextResponse.json({ authenticated: true, user: { ...finalUser, referral } });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
