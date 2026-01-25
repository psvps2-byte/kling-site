import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { klingHeaders } from "@/lib/klingAuth";

export const runtime = "nodejs";

function asStr(v: any) {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

async function readJsonOrRaw(res: Response) {
  const rawText = await res.text();
  try {
    return JSON.parse(rawText);
  } catch {
    return { raw: rawText };
  }
}

/**
 * Image→Video тарифи:
 * STANDARD: 5s=8, 10s=16
 * PRO:      5s=14, 10s=28
 *
 * start+end (image + image_tail) дозволено ТІЛЬКИ PRO
 */
function calcI2VCost(opts: { mode: "std" | "pro"; duration: 5 | 10 }) {
  const { mode, duration } = opts;
  if (mode === "pro") return duration === 10 ? 28 : 14;
  return duration === 10 ? 16 : 8;
}

export async function POST(req: Request) {
  // 0) AUTH
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;

  if (!email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const base = process.env.KLING_API_BASE || "https://api-singapore.klingai.com";
    const body = await req.json().catch(() => ({}));

    // 1) Приводимо поля до нормального виду
    const durationRaw = Number(body?.duration);
    const duration: 5 | 10 = durationRaw === 10 ? 10 : 5;

    // mode: std/pro (у тебе на фронті: "std" або "pro")
    const modeStr = asStr(body?.mode).toLowerCase();
    const mode: "std" | "pro" = modeStr === "pro" ? "pro" : "std";

    // start+end: якщо є image_tail => це start+end
    const hasStartEnd = !!body?.image_tail;

    // 2) Заборона start+end для STANDARD
    if (hasStartEnd && mode !== "pro") {
      return NextResponse.json(
        { error: "Start+End (image_tail) allowed only in PRO mode" },
        { status: 400 }
      );
    }

    // 3) Вартість
    const costPoints = calcI2VCost({ mode, duration });

    // 4) списати бали + створити generations (атомарно)
    const { data: genId, error: genErr } = await supabaseAdmin.rpc(
      "create_generation_and_spend_points",
      {
        p_email: email,
        p_kind: "I2V",
        p_tier: mode === "pro" ? "PRO" : "STANDARD",
        p_duration_sec: duration,
        p_has_start_end: hasStartEnd,
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

    // 5) Кличемо Kling (ставимо model_name примусово)
    const payload: any = { ...body };

    payload.model_name = "kling-v2-5-turbo";
    payload.mode = mode; // гарантовано "std" або "pro"
    payload.duration = String(duration); // Kling очікує строку
    // image / image_tail / prompt ми лишаємо як є, бо фронт уже шле base64

    const res = await fetch(`${base}/v1/videos/image2video`, {
      method: "POST",
      headers: {
        ...klingHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await readJsonOrRaw(res);

    // 6) Якщо помилка -> refund + FAILED
    if (!res.ok) {
      await supabaseAdmin.rpc("refund_points", { p_email: email, p_amount: costPoints });
      await supabaseAdmin
        .from("generations")
        .update({ status: "FAILED" })
        .eq("id", generationId);

      return NextResponse.json(data, { status: res.status });
    }

    // 7) якщо Kling повернув code != 0
    if (typeof (data as any)?.code === "number" && (data as any).code !== 0) {
      await supabaseAdmin.rpc("refund_points", { p_email: email, p_amount: costPoints });
      await supabaseAdmin
        .from("generations")
        .update({ status: "FAILED" })
        .eq("id", generationId);

      return NextResponse.json(data, { status: 400 });
    }

    // 8) Успіх: ставимо RUNNING + збережемо task_id
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
        result_url: null,
      })
      .eq("id", generationId);

    return NextResponse.json(
      { ...data, generation_id: generationId, cost_points: costPoints },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
