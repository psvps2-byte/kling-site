import { createClient } from "@supabase/supabase-js";
import jwt from "jsonwebtoken";
import http from "http";

/* ================= ENV ================= */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const KLING_API_KEY = (process.env.KLING_API_KEY || "").trim();
const KLING_SECRET_KEY = (process.env.KLING_SECRET_KEY || "").trim();
const KLING_API_BASE = (process.env.KLING_API_BASE || "https://api-singapore.klingai.com").trim();

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing env vars: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

if (!KLING_API_KEY || !KLING_SECRET_KEY) {
  console.error("Missing env vars: KLING_API_KEY / KLING_SECRET_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/* ============== KLING AUTH ============== */

function klingHeaders() {
  const now = Math.floor(Date.now() / 1000);

  const payload = {
    iss: KLING_API_KEY,
    exp: now + 1800,
    nbf: now - 5,
  };

  const token = jwt.sign(payload, KLING_SECRET_KEY, { algorithm: "HS256" });

  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

/* ============== ENDPOINT MAP ============== */

function klingStatusUrl(job) {
  const kind = String(job?.kind || "").toUpperCase().trim();
  const taskId = job?.task_id;

  if (!taskId) return null;

  switch (kind) {
    case "PHOTO":
    case "OMNI-IMAGE":
    case "OMNI_IMAGE":
      return `${KLING_API_BASE}/v1/images/omni-image/${encodeURIComponent(taskId)}`;

    case "I2V":
    case "IMAGE2VIDEO":
    case "IMAGE_2_VIDEO":
    case "IMAGE-2-VIDEO":
      return `${KLING_API_BASE}/v1/videos/image2video/${encodeURIComponent(taskId)}`;

    case "MOTION":
    case "MOTION-CONTROL":
    case "MOTION_CONTROL":
      return `${KLING_API_BASE}/v1/videos/motion-control/${encodeURIComponent(taskId)}`;

    default:
      console.warn("Unknown job.kind:", job?.kind);
      return null;
  }
}

/* ============== HELPERS ============== */

// ✅ беремо всі url
function pickResultUrls(json) {
  const images = json?.data?.task_result?.images;
  const videos = json?.data?.task_result?.videos;

  if (Array.isArray(images)) {
    return images.map((x) => x?.url).filter(Boolean);
  }

  if (Array.isArray(videos)) {
    return videos.map((x) => x?.url).filter(Boolean);
  }

  const single =
    json?.data?.result?.url ||
    json?.data?.url ||
    json?.result?.url ||
    json?.url ||
    null;

  return single ? [String(single)] : [];
}

function normalizeStatus(json) {
  return String(
    json?.data?.task_status ||
    json?.data?.status ||
    json?.status ||
    json?.state ||
    json?.data?.state ||
    json?.task?.status ||
    ""
  )
    .toUpperCase()
    .trim();
}

async function fetchJson(url) {
  const res = await fetch(url, {
    method: "GET",
    headers: klingHeaders(),
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(`Kling error ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  }

  return json;
}

/* ============== JOB PICKING ============== */

async function pickJob() {
  const { data, error } = await supabase
    .from("generations")
    .select("*")
    .in("status", ["QUEUED", "RUNNING", "DONE"])
    .not("task_id", "is", null)
    .eq("result_urls", "[]")
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) throw error;
  return data?.[0] || null;
}

/* ============== MAIN ============== */

async function runOnce() {
  const job = await pickJob();
  if (!job) return;

  const url = klingStatusUrl(job);
  if (!url) return;

  console.log("Checking", job.id, "kind=", job.kind, "task_id=", job.task_id);

  const json = await fetchJson(url);

  const status = normalizeStatus(json);
  const resultUrls = pickResultUrls(json);

  if (["FAILED", "ERROR", "FAILURE", "CANCELED", "CANCELLED"].includes(status)) {
    await supabase
      .from("generations")
      .update({
        status: "ERROR",
        finished_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    console.log("ERROR", job.id, status);
    return;
  }

  const isDone =
    ["SUCCEEDED", "SUCCEED", "COMPLETED", "DONE", "SUCCESS", "FINISHED"].includes(status);

  if (isDone || resultUrls.length > 0) {
    if (resultUrls.length === 0) {
      console.log("Done but no urls yet", job.id);
      return;
    }

    // беремо що вже є в базі
    const { data: row } = await supabase
      .from("generations")
      .select("result_urls")
      .eq("id", job.id)
      .single();

    const existing = Array.isArray(row?.result_urls)
      ? row.result_urls
      : [];

    // додаємо нові url, яких ще нема
    for (const url of resultUrls) {
      if (!existing.includes(url)) {
        existing.push(url);
      }
    }

    // скільки картинок замовив користувач
    const expected = Number(job?.cost_points || job?.payload?.output || 1);

    // якщо ще не всі картинки зібрались → RUNNING
    // якщо всі зібрались → DONE
    const nextStatus = existing.length >= expected ? "DONE" : "RUNNING";

    await supabase
      .from("generations")
      .update({
        status: nextStatus,
        result_urls: existing,
        result_url: existing[0],
        finished_at: nextStatus === "DONE" ? new Date().toISOString() : null,
      })
      .eq("id", job.id);

    console.log("DONE", job.id, resultUrls.length, "urls");
    return;
  }

  console.log("Still running", job.id, status);
}

async function loop() {
  try {
    await runOnce();
  } catch (e) {
    console.error("Worker error:", e?.message || e);
  } finally {
    setTimeout(loop, 5000);
  }
}

console.log("Worker started");
console.log("KLING_API_BASE =", KLING_API_BASE);

/* ============== HEALTH SERVER ============== */

const PORT = process.env.PORT || 3000;

http
  .createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
  })
  .listen(PORT, "0.0.0.0", () => console.log("Health server on", PORT));

loop();
