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

  const cost = Number(body?.cost);

  if (!Number.isFinite(cost) || cost <= 0 || cost > 1000) {
    return NextResponse.json({ error: "Invalid cost" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.rpc("spend_points", {
    p_email: email,
    p_cost: Math.floor(cost),
  });

  if (error) {
    const msg = (error.message || "").toLowerCase();

    if (msg.includes("not_enough_points")) {
      return NextResponse.json({ error: "Not enough points" }, { status: 402 });
    }
    if (msg.includes("invalid_cost")) {
      return NextResponse.json({ error: "Invalid cost" }, { status: 400 });
    }
    if (msg.includes("email_required")) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, points: Number(data ?? 0) });
}
