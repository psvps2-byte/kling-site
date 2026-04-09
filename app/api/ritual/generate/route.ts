import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import {
  getSecretFlow,
  isValidSecretFlowToken,
} from "@/lib/secretCamera";

export const runtime = "nodejs";

type GeminiPart = {
  text?: string;
  inlineData?: {
    data?: string;
  };
  inline_data?: {
    data?: string;
  };
};

type GeminiCandidate = {
  content?: {
    parts?: GeminiPart[];
  };
};

type GeminiResponse = {
  candidates?: GeminiCandidate[];
};

type GeminiInlinePart = {
  inlineData: {
    mimeType: string;
    data: string;
  };
};

type GeminiPayload = {
  contents: Array<{
    role: "user";
    parts: Array<{ text: string } | GeminiInlinePart>;
  }>;
  generationConfig: {
    responseModalities: string[];
    imageConfig: {
      aspectRatio: string;
    };
  };
};

function getFile(form: FormData, key: string) {
  const value = form.get(key);
  return value instanceof File ? value : null;
}

function getAspectRatioPrompt(prompt: string) {
  return `${prompt}\n\nOutput aspect ratio 9:16. Return one photorealistic image only.`;
}

function extFromMimeType(mimeType: string) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
}

async function fileToInlineData(file: File, fallbackName: string) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "image/jpeg";
  return {
    inlineData: {
      mimeType,
      data: buffer.toString("base64"),
    },
    filename: `${fallbackName}.${extFromMimeType(mimeType)}`,
  };
}

function pickGeminiImageB64(json: GeminiResponse) {
  const candidates = Array.isArray(json?.candidates) ? json.candidates : [];

  for (const candidate of candidates) {
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    for (const part of parts) {
      const imageData = part?.inlineData?.data || part?.inline_data?.data;
      if (typeof imageData === "string" && imageData) return imageData;
    }
  }

  return null;
}

function pickGeminiText(json: GeminiResponse) {
  const candidates = Array.isArray(json?.candidates) ? json.candidates : [];

  for (const candidate of candidates) {
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    for (const part of parts) {
      if (typeof part?.text === "string" && part.text.trim()) return part.text.trim();
    }
  }

  return "";
}

async function callGemini(model: string, apiKey: string, payload: GeminiPayload) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(payload),
  });

  const json = (await res.json().catch(() => ({}))) as GeminiResponse;
  if (!res.ok) {
    throw new Error(`Gemini error ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);
  }

  return json;
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const flowId = String(form.get("flow_id") || "").trim();
    const token = String(form.get("token") || "").trim();
    const photo = getFile(form, "photo");
    const flow = getSecretFlow(flowId);
    const userPrompt = String(form.get("prompt") || flow?.prompt || "").trim();

    if (!flow || !isValidSecretFlowToken(flowId, token)) {
      return NextResponse.json({ error: "Invalid token" }, { status: 404 });
    }

    if (!photo) {
      return NextResponse.json({ error: "Missing photo" }, { status: 400 });
    }

    const apiKey = String(process.env.GEMINI_API_KEY || "").trim();
    if (!apiKey) {
      return NextResponse.json({ error: "Missing GEMINI_API_KEY" }, { status: 500 });
    }

    try {
      await fs.access(flow.referenceFilePath);
    } catch {
      return NextResponse.json(
        {
          error: `Missing reference image at ${path.relative(process.cwd(), flow.referenceFilePath)}`,
        },
        { status: 500 }
      );
    }

    const model =
      String(process.env.GEMINI_IMAGE_MODEL_NANO_BANANA || "").trim() ||
      "gemini-2.5-flash-image";

    const capturedImage = await fileToInlineData(photo, "capture");
    const referenceImage = await (async () => {
      const buffer = await fs.readFile(flow.referenceFilePath);
      return {
        inlineData: {
          mimeType: "image/jpeg",
          data: buffer.toString("base64"),
        },
      };
    })();

    const prompt = getAspectRatioPrompt(userPrompt);
    const instructionText = [
      "Generate exactly one photorealistic vertical portrait image.",
      "Use reference image 1 as the source photo of the person. Preserve the person, face, pose, angle and lighting.",
      "Use reference image 2 as the jewelry reference only.",
      "The generated image must place the exact same pectoral from reference image 2 on the person's neck naturally and believably.",
      prompt,
    ].join(" ");

    const payload: GeminiPayload = {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: instructionText,
            },
            { inlineData: capturedImage.inlineData },
            referenceImage,
          ],
        },
      ],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: {
          aspectRatio: "9:16",
        },
      },
    };

    let json = await callGemini(model, apiKey, payload);
    let b64 = pickGeminiImageB64(json);

    if (!b64) {
      const retryPayload: GeminiPayload = {
        ...payload,
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `${instructionText} Return image output only.`,
              },
              { inlineData: capturedImage.inlineData },
              referenceImage,
            ],
          },
        ],
      };
      json = await callGemini(model, apiKey, retryPayload);
      b64 = pickGeminiImageB64(json);
    }

    if (!b64) {
      return NextResponse.json(
        { error: `Nano Banana returned no image. ${pickGeminiText(json).slice(0, 200)}` },
        { status: 502 }
      );
    }

    const outDir = path.join(process.cwd(), "public", "generated");
    await fs.mkdir(outDir, { recursive: true });

    const name = `ritual_${Date.now()}_${Math.random().toString(16).slice(2)}.png`;
    await fs.writeFile(path.join(outDir, name), Buffer.from(b64, "base64"));

    return NextResponse.json({ image_url: `/generated/${name}` });
  } catch (errorValue: unknown) {
    const error =
      errorValue instanceof Error && errorValue.message
        ? errorValue.message
        : "Generation failed";
    return NextResponse.json(
      { error },
      { status: 500 }
    );
  }
}
