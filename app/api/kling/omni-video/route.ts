import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { klingHeaders } from "@/lib/klingAuth";
import { safeFetch, readJsonOrRaw, stringifyFetchError } from "@/lib/safeFetch";

export const runtime = "nodejs";

function asStr(v: any) {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

function calcOmniVideoEditCost(mode: "std" | "pro", seconds: number) {
  const sec = Math.max(1, Math.ceil(seconds || 0));
  const perSec = mode === "pro" ? 5 : 4;
  return sec * perSec;
}

export async function POST(req: Request) {
  const supabaseAdmin = getSupabaseAdmin();

  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const base = process.env.KLING_API_BASE || "https://api-singapore.klingai.com";
  const body = await req.json().catch(() => ({}));

  const prompt = asStr(body?.prompt).trim();
  if (!prompt) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }

  const modeRaw = asStr(body?.mode).toLowerCase();
  const mode: "std" | "pro" = modeRaw === "pro" ? "pro" : "std";

  const videoList = Array.isArray(body?.video_list) ? body.video_list : [];
  const baseVideo = videoList.find((v: any) => asStr(v?.refer_type || "base").toLowerCase() === "base");
  if (!baseVideo?.video_url) {
    return NextResponse.json({ error: "video_list with base video is required" }, { status: 400 });
  }

  const seconds = Math.max(1, Math.ceil(Number(body?.duration_sec || 0) || 0));
  const costPoints = calcOmniVideoEditCost(mode, seconds);

  const { data: genId, error: genErr } = await supabaseAdmin.rpc(
    "create_generation_and_spend_points",
    {
      p_email: email,
      p_kind: "I2V",
      p_tier: mode === "pro" ? "PRO" : "STANDARD",
      p_duration_sec: null,
      p_has_start_end: false,
      p_motion_control_sec: seconds,
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

  const payload: any = { ...body };
  delete payload.duration_sec;
  payload.model_name = "kling-video-o1";
  payload.mode = mode;

  let res: Response;
  try {
    res = await safeFetch(
      `${base}/v1/videos/omni-video`,
      {
        method: "POST",
        headers: {
          ...klingHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
      { timeoutMs: 30_000, retries: 3 }
    );
  } catch (e: any) {
    const details = stringifyFetchError(e);
    await supabaseAdmin.rpc("refund_points", { p_email: email, p_amount: costPoints });
    await supabaseAdmin.from("generations").update({ status: "FAILED" }).eq("id", generationId);
    return NextResponse.json(
      { error: "fetch failed", details, generation_id: generationId },
      { status: 502 }
    );
  }

  const data = await readJsonOrRaw(res);
  if (!res.ok) {
    await supabaseAdmin.rpc("refund_points", { p_email: email, p_amount: costPoints });
    await supabaseAdmin.from("generations").update({ status: "FAILED" }).eq("id", generationId);
    return NextResponse.json({ ...data, generation_id: generationId }, { status: res.status });
  }

  if (typeof (data as any)?.code === "number" && (data as any).code !== 0) {
    await supabaseAdmin.rpc("refund_points", { p_email: email, p_amount: costPoints });
    await supabaseAdmin.from("generations").update({ status: "FAILED" }).eq("id", generationId);
    return NextResponse.json({ ...data, generation_id: generationId }, { status: 400 });
  }

  const taskId =
    (data as any)?.data?.task_id ||
    (data as any)?.task_id ||
    (data as any)?.data?.id ||
    (data as any)?.id ||
    null;

  await supabaseAdmin
    .from("generations")
    .update({
      status: "RUNNING",
      task_id: taskId ? String(taskId) : null,
      payload,
      result_url: null,
    })
    .eq("id", generationId);

  return NextResponse.json(
    { ...data, generation_id: generationId, cost_points: costPoints },
    { status: 200 }
  );
}
