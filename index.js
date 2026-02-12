import { createClient } from "@supabase/supabase-js";
import jwt from "jsonwebtoken";
import http from "http";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";

/* ================= ENV ================= */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const KLING_API_KEY = (process.env.KLING_API_KEY || "").trim();
const KLING_SECRET_KEY = (process.env.KLING_SECRET_KEY || "").trim();
const KLING_API_BASE = (process.env.KLING_API_BASE || "https://api-singapore.klingai.com").trim();

const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || "").trim();
const OPENAI_IMAGE_MODEL = (process.env.OPENAI_IMAGE_MODEL || "gpt-image-1.5").trim();
const OPENAI_IMAGE_QUALITY = (process.env.OPENAI_IMAGE_QUALITY || "medium").trim();

const R2_ENDPOINT = process.env.R2_ENDPOINT;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET;
const R2_PUBLIC_BASE = process.env.R2_PUBLIC_BASE;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing env vars: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

if (!KLING_API_KEY || !KLING_SECRET_KEY) {
  console.error("Missing env vars: KLING_API_KEY / KLING_SECRET_KEY");
  process.exit(1);
}

if (!OPENAI_API_KEY) {
  console.error("Missing env var: OPENAI_API_KEY");
  process.exit(1);
}

if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET || !R2_PUBLIC_BASE) {
  console.error("Missing R2 env vars: R2_ENDPOINT / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET / R2_PUBLIC_BASE");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const r2Client = new S3Client({
  region: "auto",
  endpoint: R2_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
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

function expectedCount(job) {
  const val = Number(job?.payload?.output ?? job?.payload?.n ?? 1);
  return Math.max(1, Math.min(9, val));
}

function pickOpenAISizeFromAspect(job) {
  const aspect = String(job?.payload?.aspect_ratio || job?.payload?.aspect || job?.payload?.format || "").trim();
  switch (aspect) {
    case "9:16":
      return "1024x1536";
    case "16:9":
      return "1536x1024";
    case "1:1":
      return "1024x1024";
    case "":
      return "1024x1024"; // default
    default:
      console.warn(`Unknown aspect ratio "${aspect}", using 1024x1024`);
      return "1024x1024";
  }
}

/* ============== OPENAI + R2 ============== */

async function downloadToBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: ${res.status}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function processPhotoWithOpenAI(job) {
  try {
    const prompt = String(job?.payload?.prompt || "").trim();
    if (!prompt) {
      throw new Error("Missing prompt in job payload");
    }

    console.log("Processing PHOTO with OpenAI", job.id, "prompt:", prompt);

    const size = pickOpenAISizeFromAspect(job);

    // Check for reference images
    const image1 = job?.payload?.image_1 || null;
    const image2 = job?.payload?.image_2 || null;
    const hasReference = image1 || image2;

    let openaiData;

    if (hasReference) {
      // Use /v1/images/edits with reference image
      console.log("Using /v1/images/edits with reference image");

      const refUrl = image1 || image2;
      const refBuffer = await downloadToBuffer(refUrl);

      const formData = new FormData();
      formData.append("model", OPENAI_IMAGE_MODEL);
      formData.append("prompt", prompt);
      formData.append("n", "1");
      formData.append("size", size);
      formData.append("quality", OPENAI_IMAGE_QUALITY);
      formData.append("image", new Blob([refBuffer], { type: "image/jpeg" }), "ref.jpg");

      const openaiRes = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: formData,
      });

      openaiData = await openaiRes.json();

      if (!openaiRes.ok) {
        throw new Error(`OpenAI error ${openaiRes.status}: ${JSON.stringify(openaiData).slice(0, 300)}`);
      }
    } else {
      // Use /v1/images/generations (no reference)
      const openaiRes = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: OPENAI_IMAGE_MODEL,
          prompt,
          n: 1,
          size,
          quality: OPENAI_IMAGE_QUALITY,
        }),
      });

      openaiData = await openaiRes.json();

      if (!openaiRes.ok) {
        throw new Error(`OpenAI error ${openaiRes.status}: ${JSON.stringify(openaiData).slice(0, 300)}`);
      }
    }

    const b64 = openaiData?.data?.[0]?.b64_json;
    if (!b64) {
      throw new Error("No b64_json in OpenAI response");
    }

    // 2) Convert to buffer
    const buffer = Buffer.from(b64, "base64");

    // 3) Upload to R2
    const randomId = crypto.randomBytes(8).toString("hex");
    const key = `generations/${job.id}-${randomId}.png`;

    await r2Client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: "image/png",
      })
    );

    const publicUrl = `${R2_PUBLIC_BASE}/${key}`;

    // 4) Update Supabase
    await supabase
      .from("generations")
      .update({
        status: "DONE",
        result_urls: [publicUrl],
        result_url: publicUrl,
        finished_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    console.log("PHOTO processed successfully", job.id, publicUrl);
  } catch (e) {
    console.error("processPhotoWithOpenAI error:", e?.message || e);

    await supabase
      .from("generations")
      .update({
        status: "ERROR",
        finished_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    throw e;
  }
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
    .order("created_at", { ascending: true })
    .limit(20);

  if (error) throw error;

  for (const job of data || []) {
    const existing = Array.isArray(job.result_urls) ? job.result_urls : [];
    const expected = expectedCount(job);
    if (existing.length < expected) return job;
  }

  return null;
}

/* ============== MAIN ============== */

async function runOnce() {
  const job = await pickJob();
  if (!job) return;

  // PHOTO without task_id -> process with OpenAI
  if (!job.task_id && String(job.kind || "").toUpperCase().trim() === "PHOTO") {
    await processPhotoWithOpenAI(job);
    return;
  }

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
    const expected = expectedCount(job);

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
