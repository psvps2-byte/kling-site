// lib/supabase.ts
import { createClient } from "@supabase/supabase-js";

export function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing SUPABASE_URL");
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}

/**
 * Забирає 1 задачу зі статусом QUEUED і атомарно намагається помітити як RUNNING.
 * Важливо: update робимо з умовою status=QUEUED і result_url is null,
 * щоб не було гонок (коли 2 воркери схопили одну задачу).
 */
export async function takeOneQueuedGeneration() {
  const supabase = getSupabaseAdmin();

  // 1) знайти одну задачу зі статусом QUEUED
  const { data, error } = await supabase
    .from("generations")
    .select("*")
    .eq("status", "QUEUED")
    .is("result_url", null)
    .order("created_at", { ascending: true }) // найстаріша
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  // 2) атомарно помітити її як RUNNING (тільки якщо вона досі QUEUED і без result_url)
  const { data: updated, error: updateError } = await supabase
    .from("generations")
    .update({ status: "RUNNING" })
    .eq("id", data.id)
    .eq("status", "QUEUED")
    .is("result_url", null)
    .select("*")
    .maybeSingle();

  if (updateError || !updated) {
    // хтось уже забрав/оновив — просто пропускаємо
    return null;
  }

  return updated;
}
