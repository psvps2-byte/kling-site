import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WORKER_BASE_URL = process.env.WORKER_BASE_URL;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !WORKER_BASE_URL) {
  console.error("Missing env vars");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function pickResultUrlFromHistory(json, fallback) {
  // PHOTO часто повертає imageUrls, I2V може повертати videoUrl
  return (
    json?.imageUrls?.[0] ||
    json?.images?.[0] ||
    json?.result?.imageUrls?.[0] ||
    json?.videoUrl ||
    json?.video?.[0] ||
    json?.result?.videoUrl ||
    fallback ||
    null
  );
}

function isDoneHistory(json) {
  // Під різні формати відповіді
  const status = (json?.status || json?.state || json?.result?.status || "")
    .toString()
    .toUpperCase();

  if (["DONE", "SUCCESS", "SUCCEEDED", "COMPLETED", "FINISHED"].includes(status)) return true;

  // Навіть якщо статус неочевидний — але є готовий URL, значить готово
  const url = pickResultUrlFromHistory(json, null);
  return Boolean(url);
}

async function runOnce() {
  console.log("Worker tick", new Date().toISOString());

  // 1) Взяти 1 задачу з черги і одразу помітити RUNNING робить сама функція в БД
  const { data, error } = await supabase.rpc("dequeue_generation");
  if (error) throw error;

  if (!data || (Array.isArray(data) && data.length === 0)) {
    console.log("No jobs available");
    return;
  }

  const job = Array.isArray(data) ? data[0] : data;

  console.log("Picked job", job.id, "kind=", job.kind, "task_id=", job.task_id);

  // ВАЖЛИВО: task_id беремо з колонки task_id
  if (!job.task_id) {
    console.error("Job has no task_id, cannot poll history:", job.id);

    // щоб не висів RUNNING вічно — помічаємо ERROR
    await supabase.from("generations").update({ status: "ERROR" }).eq("id", job.id);
    return;
  }

  // 2) Перевірити статус у Kling history
  const url = `${WORKER_BASE_URL}/api/kling/history?task_id=${encodeURIComponent(job.task_id)}`;

  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    console.error("History fetch failed", res.status, json);

    // не валимо задачу одразу — але щоб не висіло нескінченно, можна ERROR
    await supabase.from("generations").update({ status: "ERROR" }).eq("id", job.id);
    return;
  }

  if (!isDoneHistory(json)) {
    console.log("Still running (no result yet)", job.id);
    // нічого не змінюємо — залишаємо RUNNING
    return;
  }

  const resultUrl = pickResultUrlFromHistory(json, job.result_url);
  if (!resultUrl) {
    console.log("Done but no result url found, keep RUNNING for now", job.id);
    return;
  }

  // 3) Позначити DONE через RPC, яку ти створив
  const { error: doneErr } = await supabase.rpc("mark_generation_done", {
    p_id: job.id,
    p_result_url: resultUrl,
  });

  if (doneErr) throw doneErr;

  console.log("DONE", job.id, resultUrl);
}

async function loop() {
  try {
    await runOnce();
  } catch (e) {
    console.error("Loop error", e);
  } finally {
    setTimeout(loop, 5000); // кожні 5 секунд
  }
}

loop();
