import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { klingHeaders } from "@/lib/klingAuth";
import { safeFetch, readJsonOrRaw, stringifyFetchError } from "@/lib/safeFetch";

export const runtime = "nodejs";

function asStr(v: any) {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

/**
 * Normalize image input.
 * Accepts:
 * - Public URL
 * - Pure base64
 * - data:image/...;base64,XXXX  -> strips prefix to pure base64
 */
function normalizeImageValue(v: string) {
  const s = (v || "").trim();
  if (!s) return "";
  const m = s.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);
  if (m?.[1]) return m[1];
  return s;
}

/**
 * Remove any "helper/system" phrases user might have (Ukr/Rus/Eng),
 * but DO NOT add any new phrases. Leaves user's actual intent intact.
 */
function sanitizePrompt(prompt: string) {
  let p = (prompt || "").trim();
  if (!p) return p;

  const patterns = [
    // UA
    /використай\s+@?image_?\s*\d+\s+як\s+референс\s*(\([^)]*\))?\.?\s*/gi,
    /використай\s+як\s+референс\s*(\([^)]*\))?\.?\s*/gi,

    // RU
    /используй\s+@?image_?\s*\d+\s+как\s+референс\s*(\([^)]*\))?\.?\s*/gi,
    /используй\s+как\s+референс\s*(\([^)]*\))?\.?\s*/gi,

    // EN
    /use\s+@?image_?\s*\d+\s+as\s+reference\s*(\([^)]*\))?\.?\s*/gi,
    /use\s+as\s+reference\s*(\([^)]*\))?\.?\s*/gi,
  ];

  for (const re of patterns) p = p.replace(re, "");
  p = p.replace(/\s{2,}/g, " ").trim();
  return p;
}

/**
 * Convert common user tags to Kling Omni tags:
 * @image1, @image_1, @image 1  -> <<<image_1>>>
 */
function rewriteAtImageTagsToKling(prompt: string) {
  let p = (prompt || "").trim();
  if (!p) return p;

  for (let n = 1; n <= 10; n++) {
    const re = new RegExp(`@image\\s*_?\\s*${n}\\b`, "gi");
    p = p.replace(re, `<<<image_${n}>>>`);
  }
  return p;
}

/**
 * Ensure prompt includes <<<image_n>>> tags for each reference image.
 * Adds ONLY the technical tags, no phrases.
 */
function ensurePromptHasKlingImageTags(prompt: string, imageCount: number) {
  let p = (prompt || "").trim();
  const tags: string[] = [];

  for (let i = 0; i < imageCount; i++) {
    const n = i + 1;
    const re = new RegExp(`<<<\\s*image_${n}\\s*>>>`, "i");
    if (!re.test(p)) tags.push(`<<<image_${n}>>>`);
  }

  if (tags.length) p = `${tags.join(" ")} ${p}`.trim();
  return p;
}

export async function POST(req: Request) {
  const supabaseAdmin = getSupabaseAdmin();

  // 0) AUTH
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;

  if (!email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // 1) Parse body
  const base = process.env.KLING_API_BASE || "https://api-singapore.klingai.com";
  const body = await req.json().catch(() => ({}));

  // 2) Basic fields
  const model_name = asStr(body?.model_name) || "kling-image-o1";
  const resolution = asStr(body?.resolution) || "1k";
  const aspect_ratio = asStr(body?.aspect_ratio) || "auto";
  const n = 1;

  const callback_url = body?.callback_url ? asStr(body.callback_url) : undefined;
  const external_task_id = body?.external_task_id ? asStr(body.external_task_id) : undefined;

  // 3) Collect reference images
  const images: string[] = [];

  // A) image_1..image_10
  for (let i = 1; i <= 10; i++) {
    const key = `image_${i}`;
    const raw = asStr(body?.[key]).trim();
    const norm = normalizeImageValue(raw);
    if (norm) images.push(norm);
  }

  // B) image_list: [{ image: ... }] OR [{ url: ... }]
  if (!images.length && Array.isArray(body?.image_list)) {
    for (const item of body.image_list) {
      const raw = asStr(item?.image || item?.url).trim();
      const norm = normalizeImageValue(raw);
      if (norm) images.push(norm);
      if (images.length >= 10) break;
    }
  }

  const image_list = images.length ? images.map((img) => ({ image: img })) : undefined;

  // 4) Prompt
  let prompt = asStr(body?.prompt ?? "").trim();
  if (!prompt) {
    return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
  }

  prompt = sanitizePrompt(prompt);
  prompt = rewriteAtImageTagsToKling(prompt);
  if (images.length) {
    prompt = ensurePromptHasKlingImageTags(prompt, images.length);
  }

  // 5) COST (Фото: завжди 2 бали)
  const costPoints = 2;

  // 6) списати бали + створити запис генерації (атомарно)
  const { data: genId, error: genErr } = await supabaseAdmin.rpc(
    "create_generation_and_spend_points",
    {
      p_email: email,
      p_kind: "PHOTO",
      p_tier: null,
      p_duration_sec: null,
      p_has_start_end: false,
      p_motion_control_sec: 0,
      p_cost_points: costPoints,
    }
  );

  if (genErr) {
    const msg = (genErr.message || "").toLowerCase();

    if (msg.includes("not_enough_points")) {
      return NextResponse.json({ error: "Not enough points" }, { status: 402 });
    }
    if (msg.includes("user_not_found")) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    return NextResponse.json({ error: genErr.message }, { status: 500 });
  }

  const generationId = String(genId);

  // 7) Prepare payload and set status to QUEUED
  const payload: any = {
    model_name,
    prompt,
    resolution,
    n,
    aspect_ratio,
  };

  if (callback_url) payload.callback_url = callback_url;
  if (external_task_id) payload.external_task_id = external_task_id;
  if (image_list) payload.image_list = image_list;

  await supabaseAdmin
    .from("generations")
    .update({
      status: "QUEUED",
      payload,
      result_url: null,
    })
    .eq("id", generationId);

  return NextResponse.json(
    { code: 0, data: { task_id: generationId } },
    { status: 200 }
  );
}
