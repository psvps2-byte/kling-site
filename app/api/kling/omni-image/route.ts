import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

function asStr(v: any) {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

export async function POST(req: Request) {
  const supabaseAdmin = getSupabaseAdmin();

  // 0) AUTH
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;

  if (!email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // 1) Parse body
  const body = await req.json().catch(() => ({}));

  // 2) Basic fields
  const aspect_ratio = asStr(body?.aspect_ratio) || "auto";
  const n = 1;

  // 3) Prompt
  const prompt = asStr(body?.prompt ?? "").trim();
  if (!prompt) {
    return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
  }

  // 4) Reference images (if provided)
  const image_1 = body?.image_1 ? asStr(body.image_1).trim() : null;
  const image_2 = body?.image_2 ? asStr(body.image_2).trim() : null;

  // 5) COST (Фото: завжди 3 бали)
  const costPoints = 3;

  // 5) списати бали + створити запис генерації (атомарно)
  const { data: genId, error: genErr } = await supabaseAdmin.rpc(
    "create_generation_and_spend_points",
    {
      p_email: email,
      p_kind: "PHOTO",
      p_tier: null,
      p_duration_sec: null,
      p_has_start_end: false,
      p_motion_control_sec: 0,
      p_cost_points: costPoints,
    }
  );

  if (genErr) {
    const msg = (genErr.message || "").toLowerCase();

    if (msg.includes("not_enough_points")) {
      return NextResponse.json({ error: "Not enough points" }, { status: 402 });
    }
    if (msg.includes("user_not_found")) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    return NextResponse.json({ error: genErr.message }, { status: 500 });
  }

  const generationId = String(genId);

  // 6) Prepare payload and set status to QUEUED
  const payload: any = {
    provider: "openai",
    model: "gpt-image-1.5",
    quality: "medium",
    prompt,
    n,
    aspect_ratio,
  };

  // Add reference images to payload if provided
  if (image_1) payload.image_1 = image_1;
  if (image_2) payload.image_2 = image_2;

  await supabaseAdmin
    .from("generations")
    .update({
      status: "QUEUED",
      payload,
      result_url: null,
      task_id: null,
    })
    .eq("id", generationId);

  return NextResponse.json(
    { code: 0, data: { task_id: generationId } },
    { status: 200 }
  );
}
