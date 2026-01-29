import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WORKER_BASE_URL = process.env.WORKER_BASE_URL;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !WORKER_BASE_URL) {
  console.error("Missing env vars");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function pickResultUrl(json) {
  // Під різні відповіді Kling (фото/відео)
  return (
    json?.imageUrls?.[0] ||
    json?.images?.[0]?.url ||
    json?.result?.image_url ||
    json?.videoUrl ||
    json?.videoUrls?.[0] ||
    json?.result?.video_url ||
    null
  );
}

async function runOnce() {
  console.log("Worker tick", new Date().toISOString());

  // 1) Забираємо ОДНУ задачу з черги (RPC сама ставить RUNNING + started_at)
  const { data: job, error } = await supabase.rpc("dequeue_generation");
  if (error) throw error;

  const pickedJob = Array.isArray(job) ? job[0] : job;

  if (!pickedJob) {
    console.log("No jobs available");
    return;
  }

  if (!pickedJob.task_id) {
    console.error("Job has no task_id:", pickedJob.id);

    await supabase
      .from("generations")
      .update({ status: "ERROR" })
      .eq("id", pickedJob.id);

    return;
  }

  console.log("Processing", pickedJob.id, "kind=", pickedJob.kind, "task_id=", pickedJob.task_id);

  try {
    // 2) Перевіряємо статус/результат у Kling по task_id
    const url = `${WORKER_BASE_URL}/api/kling/history?task_id=${encodeURIComponent(
      pickedJob.task_id
    )}`;

    const res = await fetch(url);
    const json = await res.json();

    if (!res.ok) throw new Error(JSON.stringify(json));

    // 3) Дістаємо URL результату (якщо вже готовий)
    const resultUrl = pickResultUrl(json);

    // Якщо Kling ще не віддав результат — НЕ ставимо DONE
    // (залишаємо RUNNING і воркер перевірить наступного тіку)
    if (!resultUrl) {
      console.log("Still running (no result yet)", pickedJob.id);
      return;
    }

    // 4) Позначаємо DONE через RPC
    await supabase.rpc("mark_generation_done", {
      p_id: pickedJob.id,
      p_result_url: resultUrl,
    });

    console.log("DONE", pickedJob.id, resultUrl);
  } catch (e) {
    console.error("FAILED", pickedJob.id, e);

    await supabase
      .from("generations")
      .update({ status: "ERROR" })
      .eq("id", pickedJob.id);
  }
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
