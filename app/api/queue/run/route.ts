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

export async function POST() {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 1) Скільки зараз RUNNING
  const { count: runningCount } = await supabase
    .from("generations")
    .select("*", { count: "exact", head: true })
    .eq("kind", "PHOTO")
    .eq("status", "RUNNING");

  const freeSlots = MAX_PHOTO_CONCURRENT - (runningCount ?? 0);
  if (freeSlots <= 0) {
    return NextResponse.json({ message: "No free slots" });
  }

  // 2) Беремо з черги саме QUEUED (а не PENDING)
  const { data: queued, error: qErr } = await supabase
    .from("generations")
    .select("*")
    .eq("kind", "PHOTO")
    .eq("status", "QUEUED")
    .order("created_at", { ascending: true })
    .limit(freeSlots);

  if (qErr) {
    return NextResponse.json({ message: "DB error", error: qErr.message }, { status: 500 });
  }

  if (!queued || queued.length === 0) {
    return NextResponse.json({ message: "Queue empty" });
  }

  const token = await makeToken(
    process.env.KLING_ACCESS_KEY!,
    process.env.KLING_SECRET_KEY!
  );

  let started = 0;

  // 3) Запускаємо Kling
  for (const job of queued) {
    const res = await fetch(
      `${process.env.KLING_BASE_URL}/v1/images/generations`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(job.payload),
      }
    );

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      // якщо Kling відмовив — позначаємо ERROR щоб не висіло в черзі
      await supabase
        .from("generations")
        .update({
          status: "ERROR",
        })
        .eq("id", job.id);

      continue;
    }

    const task_id = json?.data?.task_id;

    if (!task_id) {
      // Kling ок, але не повернув task_id — теж ERROR (або можна лишити QUEUED)
      await supabase
        .from("generations")
        .update({
          status: "ERROR",
        })
        .eq("id", job.id);

      continue;
    }

    // ✅ ВАЖЛИВО: як тільки отримали task_id — ставимо RUNNING
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
}
