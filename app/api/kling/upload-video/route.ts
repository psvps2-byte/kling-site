import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Expects multipart/form-data with:
 *   - video: File
 *
 * Uses existing /api/upload/presign-put to get { uploadUrl, key }
 * Uploads file to R2 via PUT
 * Returns: { key, url }
 *
 * Requires in .env.local:
 *   R2_PUBLIC_BASE_URL=https://pub-xxxx.r2.dev
 */
function mustEnv(name: string) {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`Missing env: ${name}`);
  return v.trim();
}

function jsonError(message: string, status = 500, extra?: any) {
  return NextResponse.json({ error: message, ...(extra ? { details: extra } : {}) }, { status });
}

export async function POST(req: Request) {
  try {
    const publicBase = mustEnv("R2_PUBLIC_BASE_URL");

    const form = await req.formData();
    const file = form.get("video");

    if (!file || !(file instanceof File)) {
      return jsonError("Missing 'video' file in form-data", 400);
    }

    // 1) ask backend for presigned PUT url
    const presignRes = await fetch(new URL("/api/upload/presign-put", req.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: file.name || "video.mp4",
        contentType: file.type || "application/octet-stream",
      }),
    });

    const presignText = await presignRes.text();
    let presign: any = null;
    try {
      presign = JSON.parse(presignText);
    } catch {
      presign = { raw: presignText };
    }

    if (!presignRes.ok) {
      return jsonError(
        presign?.error || presign?.message || "Presign failed",
        presignRes.status,
        presign
      );
    }

    const uploadUrl = presign?.uploadUrl;
    const key = presign?.key;

    if (typeof uploadUrl !== "string" || !uploadUrl) return jsonError("Presign missing uploadUrl", 500, presign);
    if (typeof key !== "string" || !key) return jsonError("Presign missing key", 500, presign);

    // 2) upload to R2 using PUT (IMPORTANT: same Content-Type as presign)
    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
      },
      body: file,
    });

    if (!putRes.ok) {
      const errText = await putRes.text().catch(() => "");
      return jsonError("R2 PUT failed", 500, {
        status: putRes.status,
        body: errText,
      });
    }

    // 3) public URL for Kling (must be publicly accessible)
    const url = `${publicBase.replace(/\/$/, "")}/${key.replace(/^\//, "")}`;

    return NextResponse.json({ key, url }, { status: 200 });
  } catch (e: any) {
    return jsonError(e?.message || "Server error", 500);
  }
}
