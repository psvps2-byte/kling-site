export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { authOptions } from "@/lib/auth";

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
  const avatar_url = (session.user as any).image ?? null;

  // 1) знайти користувача
  const { data: existing, error: selectErr } = await supabaseAdmin
    .from("users")
    .select("id,email,name,avatar_url,points,role,created_at")
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
      .select("id,email,name,avatar_url,points,role,created_at")
      .single();

    if (insertErr) {
      const res = NextResponse.json({ error: insertErr.message }, { status: 500 });
      res.headers.set("Cache-Control", "no-store");
      return res;
    }

    const res = NextResponse.json({ authenticated: true, user: created });
    res.headers.set("Cache-Control", "no-store");
    return res;
  }

  // 3) якщо є — повернути
  const res = NextResponse.json({ authenticated: true, user: existing });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
