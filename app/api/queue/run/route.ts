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

  // 1️⃣ Скільки зараз RUNNING
  const { count: runningCount } = await supabase
    .from("generations")
    .select("*", { count: "exact", head: true })
    .eq("kind", "PHOTO")
    .eq("status", "RUNNING");

  const freeSlots = MAX_PHOTO_CONCURRENT - (runningCount ?? 0);
  if (freeSlots <= 0) {
    return NextResponse.json({ message: "No free slots" });
  }

  // 2️⃣ Беремо PENDING
  const { data: queued } = await supabase
    .from("generations")
    .select("*")
    .eq("kind", "PHOTO")
    .eq("status", "PENDING")
    .order("created_at", { ascending: true })
    .limit(freeSlots);

  if (!queued || queued.length === 0) {
    return NextResponse.json({ message: "Queue empty" });
  }

  const token = await makeToken(
    process.env.KLING_ACCESS_KEY!,
    process.env.KLING_SECRET_KEY!
  );

  // 3️⃣ Запускаємо Kling
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

    if (!res.ok) continue;

    const json = await res.json();
    const task_id = json?.data?.task_id;

    if (task_id) {
      await supabase
        .from("generations")
        .update({
          status: "RUNNING",
          task_id: task_id,
          result_url: null,
        })
        .eq("id", job.id);
    }
  }

  return NextResponse.json({ started: queued.length });
}
