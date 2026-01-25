import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;

  if (!email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const amount = Number(body?.amount);

  if (!Number.isFinite(amount) || amount <= 0 || amount > 1000) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.rpc("refund_points", {
    p_email: email,
    p_amount: Math.floor(amount),
  });

  if (error) {
    const msg = (error.message || "").toLowerCase();

    if (msg.includes("invalid_amount")) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }
    if (msg.includes("user_not_found")) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (msg.includes("email_required")) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, points: Number(data ?? 0) });
}
