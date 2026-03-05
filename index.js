import { createClient } from "@supabase/supabase-js";
import jwt from "jsonwebtoken";
import http from "http";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";
import OpenAI from "openai";
import { toFile } from "openai/uploads";

/* ================= ENV ================= */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const KLING_API_KEY = (process.env.KLING_API_KEY || "").trim();
const KLING_SECRET_KEY = (process.env.KLING_SECRET_KEY || "").trim();
const KLING_API_BASE = (process.env.KLING_API_BASE || "https://api-singapore.klingai.com").trim();

const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || "").trim();
const OPENAI_IMAGE_MODEL = (process.env.OPENAI_IMAGE_MODEL || "gpt-image-1.5").trim();
const OPENAI_IMAGE_MODEL_CHATGPT = (process.env.OPENAI_IMAGE_MODEL_CHATGPT || OPENAI_IMAGE_MODEL).trim();
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || "").trim();
const GEMINI_IMAGE_MODEL_NANO_BANANA = (
  process.env.GEMINI_IMAGE_MODEL_NANO_BANANA ||
  process.env.OPENAI_IMAGE_MODEL_NANO_BANANA ||
  "gemini-2.5-flash-image"
).trim();
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

const WORKER_ID = process.env.WORKER_ID || `worker-${Math.random().toString(16).slice(2)}`;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

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
  const modelName = String(job?.payload?.model_name || "").toLowerCase();

  if (!taskId) return null;

  // Omni video tasks are stored as I2V kind in DB, so use payload hint first.
  if (modelName === "kling-video-o1") {
    return `${KLING_API_BASE}/v1/videos/omni-video/${encodeURIComponent(taskId)}`;
  }

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

function pickOpenAIModelForPhoto(job) {
  const choice = String(job?.payload?.model_choice || "").trim().toLowerCase();
  if (choice === "chatgpt") {
    return OPENAI_IMAGE_MODEL_CHATGPT || OPENAI_IMAGE_MODEL;
  }

  const raw = String(job?.payload?.model || "").trim();
  if (raw && !raw.toLowerCase().startsWith("gemini-")) return raw;

  return OPENAI_IMAGE_MODEL_CHATGPT || OPENAI_IMAGE_MODEL;
}

function isNanoBananaChoice(job) {
  const choice = String(job?.payload?.model_choice || "").trim().toLowerCase();
  return choice === "nano-banana";
}

function pickNanoBananaModel(job) {
  const raw = String(job?.payload?.model || "").trim();
  if (raw.toLowerCase().startsWith("gemini-")) return raw;
  return GEMINI_IMAGE_MODEL_NANO_BANANA || "gemini-2.5-flash-image";
}

function pickGeminiAspectRatio(aspect) {
  const a = String(aspect || "").trim();
  const allowed = new Set(["1:1", "3:2", "2:3", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"]);
  if (allowed.has(a)) return a;
  return "1:1";
}

/* ============== OPENAI + R2 ============== */

function sanitizePromptForOpenAI(prompt) {
  let p = prompt || "";

  // Remove image tokens
  p = p.replace(/<<<image_\d+>>>/gi, "");

  // Replace NSFW words with neutral alternatives
  const replacements = {
    sensual: "elegant",
    seductive: "stylish",
    erotic: "artistic",
    lingerie: "fashion",
    "deep neckline": "elegant neckline",
    provocative: "fashionable",
    sexy: "glamorous",
    "low cut": "elegant cut",
    cleavage: "neckline",
  };

  for (const [bad, good] of Object.entries(replacements)) {
    const re = new RegExp(bad, "gi");
    p = p.replace(re, good);
  }

  return p.replace(/\s+/g, " ").trim();
}

async function downloadToBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: ${res.status}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function guessContentType(url, fallback = "image/png") {
  const clean = String(url || "").split("?")[0].toLowerCase();
  if (clean.endsWith(".jpg") || clean.endsWith(".jpeg")) return "image/jpeg";
  if (clean.endsWith(".webp")) return "image/webp";
  if (clean.endsWith(".gif")) return "image/gif";
  if (clean.endsWith(".png")) return "image/png";
  return fallback;
}

function extFromType(contentType) {
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/gif") return "gif";
  return "png";
}

async function downloadImageForOpenAI(url, fallbackBaseName) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: ${res.status}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const headerType = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const contentType = headerType || guessContentType(url);
  const ext = extFromType(contentType);
  const filename = `${fallbackBaseName}.${ext}`;

  return { buffer, contentType, filename };
}

function withAspectInPrompt(prompt, aspect) {
  const a = String(aspect || "").trim();
  if (!a || a === "1:1") return prompt;
  return `${prompt}\n\nAspect ratio: ${a}.`;
}

function buildGeminiInstruction(userPrompt, aspect, hasImage1, hasImage2) {
  const ar = pickGeminiAspectRatio(aspect);

  if (hasImage1 && hasImage2) {
    return [
      "Generate exactly one photorealistic image.",
      "Use reference image 1 as the main subject identity and structure.",
      "Use reference image 2 as style reference only (lighting, color palette, mood).",
      "Keep key facial/body identity from reference image 1.",
      `Output aspect ratio ${ar}.`,
      `User request: ${userPrompt}`,
    ].join(" ");
  }

  if (hasImage1) {
    return [
      "Generate exactly one photorealistic image.",
      "Use reference image 1 as the main subject and preserve identity/features.",
      `Output aspect ratio ${ar}.`,
      `User request: ${userPrompt}`,
    ].join(" ");
  }

  return [
    "Generate exactly one photorealistic image.",
    `Output aspect ratio ${ar}.`,
    `User request: ${userPrompt}`,
  ].join(" ");
}

function pickGeminiImageB64(json) {
  const candidates = Array.isArray(json?.candidates) ? json.candidates : [];
  for (const c of candidates) {
    const parts = Array.isArray(c?.content?.parts) ? c.content.parts : [];
    for (const p of parts) {
      const d1 = p?.inlineData?.data;
      if (typeof d1 === "string" && d1) return d1;
      const d2 = p?.inline_data?.data;
      if (typeof d2 === "string" && d2) return d2;
    }
  }
  return null;
}

function pickGeminiText(json) {
  const candidates = Array.isArray(json?.candidates) ? json.candidates : [];
  for (const c of candidates) {
    const parts = Array.isArray(c?.content?.parts) ? c.content.parts : [];
    for (const p of parts) {
      if (typeof p?.text === "string" && p.text.trim()) return p.text.trim();
    }
  }
  return "";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeErrMsg(e) {
  if (!e) return "";
  if (typeof e === "string") return e;
  if (typeof e?.message === "string") return e.message;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

function isOpenAISafetyError(e) {
  const msg = normalizeErrMsg(e).toLowerCase();
  return (
    msg.includes("rejected by the safety system") ||
    msg.includes("safety_violation") ||
    msg.includes("safety system")
  );
}

function extractPromptFromJob(job) {
  const p = job?.payload;
  const payload = typeof p === "string" ? (() => {
    try { return JSON.parse(p); } catch { return {}; }
  })() : (p || {});

  const raw =
    payload?.prompt ??
    payload?.text ??
    payload?.description ??
    job?.prompt ??
    "";

  return String(raw || "").trim();
}

async function callGeminiGenerateContent(model, payload) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": GEMINI_API_KEY,
    },
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Gemini error ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  }

  return json;
}

async function generatePhotoWithGemini(job, prompt, aspect, image1, image2) {
  if (!GEMINI_API_KEY) {
    throw new Error("Missing GEMINI_API_KEY for Nano Banana model");
  }

  const model = pickNanoBananaModel(job);
  if (!/image/i.test(model)) {
    throw new Error(`Nano Banana model must be an image model, got: "${model}"`);
  }
  const parts = [
    {
      text: buildGeminiInstruction(
        prompt,
        aspect,
        Boolean(image1),
        Boolean(image2)
      ),
    },
  ];

  if (image1) {
    const img1 = await downloadImageForOpenAI(image1, "ref1");
    parts.push({
      inlineData: {
        mimeType: img1.contentType,
        data: img1.buffer.toString("base64"),
      },
    });
  }

  if (image2) {
    const img2 = await downloadImageForOpenAI(image2, "ref2");
    parts.push({
      inlineData: {
        mimeType: img2.contentType,
        data: img2.buffer.toString("base64"),
      },
    });
  }

  const payload = {
    contents: [
      {
        role: "user",
        parts,
      },
    ],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: {
        aspectRatio: pickGeminiAspectRatio(aspect),
      },
    },
  };

  let lastT1 = "";
  let lastT2 = "";

  // Extra resiliency: repeat the pair of requests once if model returns text-only.
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const first = await callGeminiGenerateContent(model, payload);
    let b64 = pickGeminiImageB64(first);
    if (b64) return b64;

    // Retry with stronger instruction if first response is text-only.
    const retryPayload = {
      ...payload,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `${buildGeminiInstruction(
                prompt,
                aspect,
                Boolean(image1),
                Boolean(image2)
              )} Return image output only.`,
            },
            ...parts.slice(1),
          ],
        },
      ],
    };
    const second = await callGeminiGenerateContent(model, retryPayload);
    b64 = pickGeminiImageB64(second);
    if (b64) return b64;

    lastT1 = pickGeminiText(first);
    lastT2 = pickGeminiText(second);

    if (attempt < 2) {
      await sleep(500);
    }
  }

  throw new Error(
    `Gemini returned no image data. text1="${lastT1.slice(0, 120)}" text2="${lastT2.slice(0, 120)}"`
  );
}

async function uploadToR2(buffer, type, jobId) {
  try {
    const ext = type === 'video' ? 'mp4' : 'png';
    const folder = type === 'video' ? 'v' : 'i';
    const mimeType = type === 'video' ? 'video/mp4' : 'image/png';
    
    // Generate 6-8 char id (crypto.randomBytes(4) = 8 hex chars)
    const shortId = crypto.randomBytes(4).toString('hex');
    const key = `${folder}/${shortId}.${ext}`;
    
    // Upload to R2
    await r2Client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      })
    );
    
    // For videos, use hardcoded CDN domain; for images, use R2_PUBLIC_BASE
    const publicUrl = type === 'video' 
      ? `https://cdn.vilna.pro/${key}`
      : `${R2_PUBLIC_BASE}/${key}`;
    
    console.log(`${type} uploaded to R2:`, publicUrl);
    
    return publicUrl;
  } catch (e) {
    console.error("uploadToR2 error:", e?.message || e);
    throw e;
  }
}

/* ============== PHOTO GENERATION ============== */

async function processPhotoWithOpenAI(job) {
  try {
    const image1 = job?.payload?.image_1 || null;
    const image2 = job?.payload?.image_2 || null;
    const hasReference = image1 || image2;

    let prompt = extractPromptFromJob(job);
    if (!prompt && hasReference) {
      // Fallback prompt keeps generation alive for malformed legacy payloads.
      prompt = "Create a high-quality photorealistic image based on the reference image(s).";
      console.warn("Missing prompt in job payload, using fallback prompt for job", job?.id);
    }
    if (!prompt) {
      throw new Error("Missing prompt in job payload");
    }

    const size = pickOpenAISizeFromAspect(job);
    const model = pickOpenAIModelForPhoto(job);

    // Sanitize prompt
    prompt = sanitizePromptForOpenAI(prompt);

    console.log("Processing PHOTO with OpenAI", job.id, "prompt:", prompt);

    // // Add identity preservation instruction when using reference
    // if (hasReference) {
    //   prompt = `Keep the person's identity and facial features the same as in the reference image. Do not change face shape, eyes, nose, lips. ${prompt}`;
    // }

    console.log("Processing PHOTO with OpenAI", job.id, "prompt:", prompt);

    let b64 = null;
    const useNanoBanana = isNanoBananaChoice(job);

    if (useNanoBanana) {
      console.log("Using Gemini Nano Banana", job.id);
      b64 = await generatePhotoWithGemini(
        job,
        prompt,
        job?.payload?.aspect_ratio || "",
        image1,
        image2
      );
    } else {
      let openaiData;

      try {
        if (hasReference) {
          // Use OpenAI SDK for edits to avoid malformed multipart requests.
          console.log("Using OpenAI images.edit with reference image(s)");
          const editImages = [];

          if (image1) {
            try {
              const img1 = await downloadImageForOpenAI(image1, "ref1");
              editImages.push(await toFile(img1.buffer, img1.filename, { type: img1.contentType }));
            } catch (e) {
              console.error("Failed to download image_1:", e?.message || e);
              throw new Error("Failed to download reference image 1");
            }
          }

          if (image2) {
            try {
              const img2 = await downloadImageForOpenAI(image2, "ref2");
              editImages.push(await toFile(img2.buffer, img2.filename, { type: img2.contentType }));
            } catch (e) {
              console.error("Failed to download image_2:", e?.message || e);
              throw new Error("Failed to download reference image 2");
            }
          }

          const editRes = await openai.images.edit({
            model,
            image: editImages,
            prompt,
            size,
            n: 1,
          });
          openaiData = editRes;
        } else {
          // Use /v1/images/generations fallback for text-only prompts
          console.log("Using /v1/images/generations without reference");

          const genRes = await openai.images.generate({
            model,
            prompt,
            n: 1,
            size,
            quality: OPENAI_IMAGE_QUALITY,
          });
          openaiData = genRes;
        }
      } catch (e) {
        // Keep model behavior predictable: do not silently switch providers for ChatGPT jobs.
        if (isOpenAISafetyError(e)) {
          console.warn("OpenAI safety rejection for job", job?.id);
        }
        throw e;
      }

      if (!b64) {
        b64 = openaiData?.data?.[0]?.b64_json || null;
      }
    }

    if (!b64) {
      throw new Error("No image returned by selected model");
    }

    // 2) Convert to buffer
    const buffer = Buffer.from(b64, "base64");

    // 3) Upload to R2
    const publicUrl = await uploadToR2(buffer, 'image', job.id);

    // 4) Update Supabase
    await supabase
      .from("generations")
      .update({
        status: "DONE",
        result_urls: [publicUrl],
        result_url: publicUrl,
        finished_at: new Date().toISOString(),
        locked_at: null,
        locked_by: null,
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
        locked_at: null,
        locked_by: null,
      })
      .eq("id", job.id);
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
  const { data, error } = await supabase.rpc("claim_generation", {
    p_worker_id: WORKER_ID,
  });

  if (error) throw error;
  return data || null;
}

/* ============== MAIN ============== */

function minutesAgo(iso) {
  if (!iso) return 0;
  return (Date.now() - new Date(iso).getTime()) / 1000 / 60;
}

async function runOnce() {
  const job = await pickJob();
  if (!job) return;

  const kind = String(job.kind || "").toUpperCase().trim();

  // КРОК 1: auto-fail QUEUED без task_id (не PHOTO)
  if (job.status === "QUEUED" && !job.task_id && kind !== "PHOTO") {
    const ageMin = minutesAgo(job.created_at);
    if (ageMin > 3) {
      await supabase
        .from("generations")
        .update({
          status: "ERROR",
          finished_at: new Date().toISOString(),
          locked_at: null,
          locked_by: null,
        })
        .eq("id", job.id);

      console.log("Auto-failed QUEUED without task_id:", job.id);
    }
    return;
  }

  // КРОК 2: auto-timeout RUNNING
  if (job.status === "RUNNING") {
    const ageMin = minutesAgo(job.created_at);
    if (ageMin > 30) {
      await supabase
        .from("generations")
        .update({
          status: "ERROR",
          finished_at: new Date().toISOString(),
          locked_at: null,
          locked_by: null,
        })
        .eq("id", job.id);

      console.log("Auto-timeout RUNNING:", job.id);
      return;
    }
  }

  // PHOTO without task_id -> process with OpenAI
  if (!job.task_id && kind === "PHOTO") {
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
        locked_at: null,
        locked_by: null,
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

    // Check if this is a video job (I2V or MOTION)
    const kind = String(job?.kind || "").toUpperCase().trim();
    const isVideoJob = ["I2V", "IMAGE2VIDEO", "IMAGE_2_VIDEO", "IMAGE-2-VIDEO", "MOTION", "MOTION-CONTROL", "MOTION_CONTROL"].includes(kind);

    // додаємо нові url, яких ще нема
    for (const klingUrl of resultUrls) {
      if (!existing.includes(klingUrl)) {
        // For video jobs, download from Kling and upload to R2
        if (isVideoJob) {
          try {
            const buffer = await downloadToBuffer(klingUrl);
            const r2Url = await uploadToR2(buffer, 'video', job.id);
            existing.push(r2Url);
          } catch (e) {
            console.error("Failed to upload video to R2:", e?.message || e);
            // Don't store Kling URL if upload fails
          }
        }
        // For non-video jobs (images), don't store Kling URLs
        // Images are generated by OpenAI and uploaded via processPhotoWithOpenAI
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
        locked_at: nextStatus === "DONE" ? null : undefined,
        locked_by: nextStatus === "DONE" ? null : undefined,
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
