import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WORKER_BASE_URL_RAW = process.env.WORKER_BASE_URL;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !WORKER_BASE_URL_RAW) {
  console.error("Missing env vars", {
    SUPABASE_URL: Boolean(SUPABASE_URL),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(SUPABASE_SERVICE_ROLE_KEY),
    WORKER_BASE_URL: Boolean(WORKER_BASE_URL_RAW),
  });
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function normalizeBaseUrl(raw) {
  let s = String(raw || "").trim();
  if (!s) return "";

  // якщо користувач зберіг домен без протоколу — додаємо https://
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;

  // прибрати кінцевий слеш
  s = s.replace(/\/+$/, "");
  return s;
}

const WORKER_BASE_URL = normalizeBaseUrl(WORKER_BASE_URL_RAW);

function pickResultUrlFromHistory(json, fallback) {
  // різні формати відповідей
  return (
    json?.result_url ||
    json?.resultUrl ||
    json?.url ||
    json?.urls?.[0] ||
    json?.imageUrls?.[0] ||
    json?.images?.[0] ||
    json?.result?.imageUrls?.[0] ||
    json?.result?.images?.[0] ||
    json?.videoUrl ||
    json?.video?.[0] ||
    json?.result?.videoUrl ||
    fallback ||
    null
  );
}

function isDoneHistory(json) {
  const status = (json?.status || json?.state || json?.result?.status || "")
    .toString()
    .toUpperCase();

  if (["DONE", "SUCCESS", "SUCCEEDED", "COMPLETED", "FINISHED"].includes(status)) return true;

  // якщо статус неочевидний — але є готовий URL, значить готово
  const url = pickResultUrlFromHistory(json, null);
  return Boolean(url);
}

async function fetchJsonWithTimeout(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { signal: controller.signal });
    const json = await res.json().catch(() => ({}));
    return { res, json };
  } finally {
    clearTimeout(t);
  }
}

async function runOnce() {
  console.log("Worker tick", new Date().toISOString());

  // 1) беремо 1 задачу з черги (RPC одразу ставить RUNNING)
  const { data, error } = await supabase.rpc("dequeue_generation");
  if (error) throw error;

  if (!data || (Array.isArray(data) && data.length === 0)) {
    console.log("No jobs available");
    return;
  }

  const job = Array.isArray(data) ? data[0] : data;
  console.log("Picked job", job.id, "kind=", job.kind, "task_id=", job.task_id);

  if (!job.task_id) {
    console.error("Job has no task_id, cannot poll history:", job.id);
    await supabase.from("generations").update({ status: "ERROR" }).eq("id", job.id);
    return;
  }

  // 2) перевіряємо history
  const historyUrl = `${WORKER_BASE_URL}/api/kling/history?task_id=${encodeURIComponent(job.task_id)}`;

  let res, json;
  try {
    const out = await fetchJsonWithTimeout(historyUrl, 15000);
    res = out.res;
    json = out.json;
  } catch (e) {
    // тимчасова помилка мережі/таймаут — НЕ валимо задачу в ERROR
    console.error("History fetch exception (will retry later)", String(e?.message || e));
    return;
  }

  if (!res.ok) {
    console.error("History fetch failed", res.status, json);

    // якщо Kling каже 404/invalid task — тоді вже ERROR
    if (res.status === 404) {
      await supabase.from("generations").update({ status: "ERROR" }).eq("id", job.id);
    }
    return;
  }

  if (!isDoneHistory(json)) {
    console.log("Still running (no result yet)", job.id);
    return;
  }

  const resultUrl = pickResultUrlFromHistory(json, job.result_url);
  if (!resultUrl) {
    console.log("Done but no result url found, keep RUNNING for now", job.id);
    return;
  }

  // 3) помічаємо DONE
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
    setTimeout(loop, 5000);
  }
}

console.log("Worker started. WORKER_BASE_URL =", WORKER_BASE_URL);
loop();
