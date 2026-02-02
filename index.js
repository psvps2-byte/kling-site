import { createClient } from "@supabase/supabase-js";
import jwt from "jsonwebtoken";

/* ================= ENV ================= */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const KLING_API_KEY = (process.env.KLING_API_KEY || "").trim(); // AK / issuer
const KLING_SECRET_KEY = (process.env.KLING_SECRET_KEY || "").trim(); // SK / secret
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

/* ============== KLING AUTH (same as web klingHeaders) ============== */

function klingHeaders() {
  const now = Math.floor(Date.now() / 1000);

  // same idea as your lib/klingAuth.ts:
  // iss = AK, signed by SK
  const payload = {
    iss: KLING_API_KEY,
    exp: now + 1800, // 30 min
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
    // PHOTO in your DB = omni-image endpoint
    case "PHOTO":
    case "OMNI-IMAGE":
    case "OMNI_IMAGE":
      return `${KLING_API_BASE}/v1/images/omni-image/${encodeURIComponent(taskId)}`;

    case "IMAGE2VIDEO":
    case "IMAGE2VIDEO ":
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

function pickResultUrl(json) {
  return (
    json?.data?.result?.url ||
    json?.data?.url ||
    json?.result?.url ||
    json?.url ||
    json?.data?.outputs?.[0] ||
    json?.outputs?.[0] ||
    json?.data?.images?.[0] ||
    json?.images?.[0] ||
    null
  );
}

function normalizeStatus(json) {
  return String(
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
    .in("status", ["QUEUED", "RUNNING"])
    .not("task_id", "is", null)
    .is("result_url", null)
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
  console.log("Kling response keys:", Object.keys(json || {}));
  console.log("Kling data keys:", Object.keys(json?.data || {}));
  console.log("Kling raw snippet:", JSON.stringify(json).slice(0, 800));

  const status = normalizeStatus(json);
  const resultUrl = pickResultUrl(json);

  if (["FAILED", "ERROR", "FAILURE", "CANCELED", "CANCELLED"].includes(status)) {
    await supabase
      .from("generations")
      .update({
        status: "ERROR",
        finished_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    console.log("ERROR", job.id, "status=", status);
    return;
  }

  if (["SUCCEEDED", "COMPLETED", "DONE", "SUCCESS", "FINISHED"].includes(status) || resultUrl) {
    if (!resultUrl) {
      console.log("Done status but no resultUrl yet:", job.id, "status=", status);
      return;
    }

    await supabase
      .from("generations")
      .update({
        status: "DONE",
        result_url: resultUrl,
        finished_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    console.log("DONE", job.id, resultUrl);
    return;
  }

  console.log("Still running", job.id, "status=", status || "(empty)");
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
loop();
