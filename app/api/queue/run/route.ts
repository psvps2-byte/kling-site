import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SignJWT } from "jose";

const MAX_PHOTO_CONCURRENT = 9;

async function makeToken(ak: string, sk: string) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ak)
    .setNotBefore(now - 5)
    .setExpirationTime(now + 1800)
    .sign(new TextEncoder().encode(sk));
}

function getTaskIdFromKlingResponse(json: any): string | null {
  // Під різні формати відповіді
  const taskId =
    json?.task_id ||
    json?.data?.task_id ||
    json?.data?.id ||
    json?.id ||
    null;

  return typeof taskId === "string" && taskId.length > 0 ? taskId : null;
}

export async function POST() {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    const KLING_ACCESS_KEY = process.env.KLING_ACCESS_KEY;
    const KLING_SECRET_KEY = process.env.KLING_SECRET_KEY;
    const KLING_BASE_URL = process.env.KLING_BASE_URL;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { message: "Missing Supabase env vars" },
        { status: 500 }
      );
    }

    if (!KLING_ACCESS_KEY || !KLING_SECRET_KEY || !KLING_BASE_URL) {
      return NextResponse.json(
        { message: "Missing Kling env vars" },
        { status: 500 }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1) Скільки зараз RUNNING
    const { count: runningCount, error: runErr } = await supabase
      .from("generations")
      .select("*", { count: "exact", head: true })
      .eq("kind", "PHOTO")
      .eq("status", "RUNNING");

    if (runErr) {
      return NextResponse.json(
        { message: "DB error (runningCount)", error: runErr.message },
        { status: 500 }
      );
    }

    const freeSlots = MAX_PHOTO_CONCURRENT - (runningCount ?? 0);
    if (freeSlots <= 0) {
      return NextResponse.json({ message: "No free slots", started: 0 });
    }

    // 2) Беремо з черги саме QUEUED
    const { data: queued, error: qErr } = await supabase
      .from("generations")
      .select("*")
      .eq("kind", "PHOTO")
      .eq("status", "QUEUED")
      .order("created_at", { ascending: true })
      .limit(freeSlots);

    if (qErr) {
      return NextResponse.json(
        { message: "DB error (queue)", error: qErr.message },
        { status: 500 }
      );
    }

    if (!queued || queued.length === 0) {
      return NextResponse.json({ message: "Queue empty", started: 0 });
    }

    const token = await makeToken(KLING_ACCESS_KEY, KLING_SECRET_KEY);

    let started = 0;

    // 3) Запускаємо Kling
    for (const job of queued) {
      const res = await fetch(`${KLING_BASE_URL}/v1/images/generations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(job.payload),
      });

      const json = await res.json().catch(() => ({}));

      // корисно для дебагу
      console.log("Kling response for job", job.id, json);

      if (!res.ok) {
        await supabase
          .from("generations")
          .update({ status: "ERROR" })
          .eq("id", job.id);

        continue;
      }

      const task_id = getTaskIdFromKlingResponse(json);

      if (!task_id) {
        await supabase
          .from("generations")
          .update({ status: "ERROR" })
          .eq("id", job.id);

        continue;
      }

      // ✅ Як тільки отримали task_id — ставимо RUNNING
      const { error: updErr } = await supabase
        .from("generations")
        .update({
          status: "RUNNING",
          task_id,
          result_url: null,
        })
        .eq("id", job.id);

      if (!updErr) started += 1;
    }

    return NextResponse.json({ started });
  } catch (e: any) {
    console.error("queue/run POST error:", e);
    return NextResponse.json(
      { message: "Internal error", error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
