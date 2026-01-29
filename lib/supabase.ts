// lib/supabase.ts
import { createClient } from "@supabase/supabase-js";

export function getSupabaseAdmin() {
  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing SUPABASE_URL");
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}
export async function takeOnePendingGeneration() {
  const supabase = getSupabaseAdmin();

  // 1) знайти одну задачу зі статусом PENDING
  const { data, error } = await supabase
    .from("generations")
    .select("*")
    .eq("status", "PENDING")
    .is("result_url", null)
    .limit(1)
    .single();

  if (error || !data) {
    return null;
  }

  // 2) помітити її як RUNNING
  const { error: updateError } = await supabase
    .from("generations")
    .update({ status: "RUNNING" })
    .eq("id", data.id);

  if (updateError) {
    return null;
  }

  return data;
}
