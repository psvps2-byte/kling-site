import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import fs from "fs/promises";
import path from "path";

export const runtime = "nodejs";

function sizeByAspect(aspect: string) {
  if (aspect === "9:16") return "1024x1536";
  if (aspect === "16:9") return "1536x1024";
  return "1024x1024";
}

// ✅ щоб при відкритті URL в браузері не було 405
export async function GET() {
  return NextResponse.json({ ok: true, hint: "Use POST /api/gpt-txt2img" }, { status: 200 });
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const aspect_ratio = String(body?.aspect_ratio ?? "1:1");
  const prompt = String(body?.prompt ?? "").trim();

  if (!prompt) return NextResponse.json({ error: "Missing prompt" }, { status: 400 });

  const openai = new OpenAI({ apiKey });

  const r = await openai.images.generate({
    model: "gpt-image-1.5",
    prompt,
    size: sizeByAspect(aspect_ratio) as any,
  });

  const b64 = r.data?.[0]?.b64_json;
  if (!b64) return NextResponse.json({ error: "No image returned" }, { status: 500 });

  const outDir = path.join(process.cwd(), "public", "generated");
  await fs.mkdir(outDir, { recursive: true });

  const name = `gpt_${Date.now()}.png`;
  await fs.writeFile(path.join(outDir, name), Buffer.from(b64, "base64"));

  return NextResponse.json({ image_url: `/generated/${name}` });
}
