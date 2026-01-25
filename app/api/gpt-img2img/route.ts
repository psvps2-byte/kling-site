import { NextResponse } from "next/server";
import path from "path";
import { promises as fs } from "fs";
import OpenAI from "openai";
import { toFile } from "openai/uploads";
import heicConvert from "heic-convert";

export const runtime = "nodejs";

type Size = "1024x1024" | "1024x1536" | "1536x1024" | "auto";

function sizeByAspect(aspect: string): Size {
  if (aspect === "9:16") return "1024x1536";
  if (aspect === "16:9") return "1536x1024";
  return "1024x1024";
}

function isHeicMime(mime: string) {
  return mime === "image/heic" || mime === "image/heif";
}

async function fileToBuffer(file: File): Promise<Buffer> {
  const ab = await file.arrayBuffer();
  return Buffer.from(new Uint8Array(ab));
}

async function convertHeicToJpeg(input: Buffer): Promise<Buffer> {
  const out = await heicConvert({
    buffer: input,
    format: "JPEG",
    quality: 0.9,
  });

  if (Buffer.isBuffer(out)) return out;
  if (out instanceof Uint8Array) return Buffer.from(out);
  return Buffer.from(new Uint8Array(out));
}

async function normalizeUpload(file: File) {
  let buf = await fileToBuffer(file);
  let mime = file.type || "image/png";
  let name = file.name || "image.png";

  if (isHeicMime(mime) || /\.(heic|heif)$/i.test(name)) {
    buf = await convertHeicToJpeg(buf);
    mime = "image/jpeg";
    name = name.replace(/\.(heic|heif)$/i, ".jpg");
  }

  return await toFile(buf, name, { type: mime });
}

function getFile(form: FormData, key: string): File | null {
  const v = form.get(key);
  return v instanceof File ? v : null;
}

// ✅ Запис у history.json (щоб /history показував)
async function appendHistory(entry: any) {
  const dataDir = path.join(process.cwd(), "data");
  const historyPath = path.join(dataDir, "history.json");

  await fs.mkdir(dataDir, { recursive: true });

  let arr: any[] = [];
  try {
    const raw = await fs.readFile(historyPath, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) arr = parsed;
  } catch {
    arr = [];
  }

  // нове — на початок
  arr.unshift(entry);

  // тримаємо файл не безкінечний (наприклад 500 останніх)
  if (arr.length > 500) arr = arr.slice(0, 500);

  await fs.writeFile(historyPath, JSON.stringify(arr, null, 2), "utf-8");
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();

    const img1 = getFile(form, "image");   // обов’язково
    const img2 = getFile(form, "image2");  // опціонально

    const prompt = String(form.get("prompt") ?? "").trim();
    const aspect = String(form.get("aspect_ratio") ?? "1:1").trim();

    // якщо ти хочеш 1 картинку — лишай 1
    const nRaw = Number(form.get("n") ?? 1);
    const n = Number.isFinite(nRaw) ? Math.min(4, Math.max(1, nRaw)) : 1;

    if (!img1) return NextResponse.json({ error: "Missing image (field: image)" }, { status: 400 });
    if (!prompt) return NextResponse.json({ error: "Prompt is required" }, { status: 400 });

    const imageFiles: any[] = [];
    imageFiles.push(await normalizeUpload(img1));
    if (img2) imageFiles.push(await normalizeUpload(img2));

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // 🔥 Якщо ти хочеш саме “як в чаті”, постав:
    // model: "gpt-image-1.5"
    const r = await openai.images.edit({
      model: "gpt-image-1.5",
      image: imageFiles as any,
      prompt,
      size: sizeByAspect(aspect),
      n,
    } as any);

    const outs = (r.data ?? [])
      .map((x: any) => x?.b64_json as string | undefined)
      .filter(Boolean) as string[];

    if (!outs.length) {
      return NextResponse.json({ error: "No image returned", details: r }, { status: 500 });
    }

    const outDir = path.join(process.cwd(), "public", "generated");
    await fs.mkdir(outDir, { recursive: true });

    const urls: string[] = [];
    for (const b64 of outs) {
      const name = `gpt_${Date.now()}_${Math.random().toString(16).slice(2)}.png`;
      await fs.writeFile(path.join(outDir, name), Buffer.from(b64, "base64"));
      urls.push(`/generated/${name}`);
    }

    // ✅ ЗАПИС У ІСТОРІЮ
    await appendHistory({
      id: `gpt_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      provider: "openai",
      model: "gpt-image-1.5",
      created_at: Date.now(),
      prompt,
      aspect_ratio: aspect,
      imageUrls: urls, // <- назва як у твоєму UI часто очікується
      image_urls: urls, // <- на всяк
      status: "succeed",
    });

    return NextResponse.json({ image_url: urls[0], image_urls: urls });
  } catch (e: any) {
    const details = e?.response?.data ?? e?.message ?? String(e);
    return NextResponse.json({ error: "OpenAI error", details }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Use POST (multipart/form-data)" }, { status: 405 });
}
