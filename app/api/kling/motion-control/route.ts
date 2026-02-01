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

/**
 * Motion Control тарифи:
 * STANDARD: 3 бали за 1s
 * PRO:      4 бали за 1s
 */
function calcMotionCost(opts: { mode: "std" | "pro"; seconds: number }) {
  const sec = Math.max(1, Math.floor(opts.seconds || 0));
  const perSec = opts.mode === "pro" ? 4 : 3;
  return sec * perSec;
}

/**
 * Kling motion-control може мати різні поля тривалості.
 * Ми підтримуємо:
 * - duration (string/number)   // найчастіше
 * - duration_sec (number)
 * - seconds (number)
 *
 * Якщо нічого нема — беремо 5 сек за замовчуванням (щоб не було 0).
 */
function readSeconds(body: any): number {
  const d1 = Number(body?.duration);
  if (Number.isFinite(d1) && d1 > 0) return d1;

  const d2 = Number(body?.duration_sec);
  if (Number.isFinite(d2) && d2 > 0) return d2;

  const d3 = Number(body?.seconds);
  if (Number.isFinite(d3) && d3 > 0) return d3;

  return 5;
}

export async function POST(req: Request) {
  const supabaseAdmin = getSupabaseAdmin();

  // 0) AUTH
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;

  if (!email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const base = process.env.KLING_API_BASE || "https://api-singapore.klingai.com";
  const body = await req.json().catch(() => ({}));

  // 1) mode std/pro
  const modeStr = asStr(body?.mode).toLowerCase();
  const mode: "std" | "pro" = modeStr === "pro" ? "pro" : "std";

  // 2) seconds
  const seconds = readSeconds(body);

  // 3) cost
  const costPoints = calcMotionCost({ mode, seconds });

  // 4) списати бали + створити generations
  const { data: genId, error: genErr } = await supabaseAdmin.rpc(
    "create_generation_and_spend_points",
    {
      p_email: email,
      p_kind: "I2V", // motion-control теж відео
      p_tier: mode === "pro" ? "PRO" : "STANDARD",
      p_duration_sec: null,
      p_has_start_end: false,
      p_motion_control_sec: Math.max(1, Math.floor(seconds)),
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

  // 5) Kling payload
  const payload: any = { ...body };
  payload.model_name = "kling-v2-6";
  payload.mode = mode; // std|pro

  let res: Response;

  try {
    res = await safeFetch(
      `${base}/v1/videos/motion-control`,
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

    // refund + FAILED
    await supabaseAdmin.rpc("refund_points", { p_email: email, p_amount: costPoints });
    await supabaseAdmin.from("generations").update({ status: "FAILED" }).eq("id", generationId);

    console.error("Kling motion-control fetch failed", details);

    return NextResponse.json(
      { error: "fetch failed", details, generation_id: generationId },
      { status: 502 }
    );
  }

  const data = await readJsonOrRaw(res);

  // 6) якщо помилка -> refund + FAILED
  if (!res.ok) {
    await supabaseAdmin.rpc("refund_points", { p_email: email, p_amount: costPoints });
    await supabaseAdmin.from("generations").update({ status: "FAILED" }).eq("id", generationId);

    return NextResponse.json({ ...data, generation_id: generationId }, { status: res.status });
  }

  // 7) якщо Kling повернув code != 0
  if (typeof (data as any)?.code === "number" && (data as any).code !== 0) {
    await supabaseAdmin.rpc("refund_points", { p_email: email, p_amount: costPoints });
    await supabaseAdmin.from("generations").update({ status: "FAILED" }).eq("id", generationId);

    return NextResponse.json({ ...data, generation_id: generationId }, { status: 400 });
  }

  // 8) task id
  const id =
    (data as any)?.data?.task_id ||
    (data as any)?.task_id ||
    (data as any)?.data?.id ||
    (data as any)?.id ||
    null;

  // 9) RUNNING + store task_id
  await supabaseAdmin
    .from("generations")
    .update({
      status: "PENDING",
      task_id: id ? String(id) : null,
      result_url: null,
    })
    .eq("id", generationId);

  return NextResponse.json(
    { ...data, id, generation_id: generationId, cost_points: costPoints },
    { status: 200 }
  );
}
