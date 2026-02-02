import { createClient } from "@supabase/supabase-js";

/* ================= ENV ================= */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const KLING_API_KEY = process.env.KLING_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !KLING_API_KEY) {
  console.error("Missing env vars");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

/* ============== ENDPOINT MAP ============== */

function klingStatusUrl(job) {
  switch (job.kind) {

    case "PHOTO":
    case "omni-image":
      return `https://api-singapore.klingai.com/v1/images/omni-image/${job.task_id}`;

    case "IMAGE2VIDEO":
    case "image2video":
      return `https://api-singapore.klingai.com/v1/videos/image2video/${job.task_id}`;

    case "MOTION":
    case "motion-control":
      return `https://api-singapore.klingai.com/v1/videos/motion-control/${job.task_id}`;

    default:
      console.warn("Unknown job.kind:", job.kind);
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
    null
  );
}

function normalizeStatus(json) {
  return String(
    json?.data?.status ||
    json?.status ||
    json?.state ||
    json?.data?.state ||
    ""
  )
    .toUpperCase()
    .trim();
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${KLING_API_KEY}`,
    },
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(JSON.stringify(json).slice(0, 300));
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

  console.log("Checking", job.id, job.kind);

  const json = await fetchJson(url);

  const status = normalizeStatus(json);
  const resultUrl = pickResultUrl(json);

  if (status === "FAILED" || status === "ERROR") {
    await supabase
      .from("generations")
      .update({
        status: "ERROR",
        finished_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    console.log("ERROR", job.id);
    return;
  }

  if (status === "SUCCEEDED" || status === "COMPLETED" || resultUrl) {
    if (!resultUrl) return;

    await supabase
      .from("generations")
      .update({
        status: "DONE",
        result_url: resultUrl,
        finished_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    console.log("DONE", job.id);
    return;
  }

  console.log("Still running", job.id, status);
}

async function loop() {
  try {
    await runOnce();
  } catch (e) {
    console.error(e);
  } finally {
    setTimeout(loop, 5000);
  }
}

console.log("Worker started");
loop();
