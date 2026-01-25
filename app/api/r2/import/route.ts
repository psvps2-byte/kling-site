import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Визначаємо розширення файлу з Content-Type.
 * ✅ Додано повну підтримку відео
 */
function guessExt(contentType?: string, fallback = "bin") {
  const ct = (contentType || "").toLowerCase();

  // images
  if (ct.includes("png")) return "png";
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("gif")) return "gif";
  if (ct.includes("heic")) return "heic";
  if (ct.includes("heif")) return "heif";

  // ✅ videos
  if (ct.includes("video/mp4")) return "mp4";
  if (ct.includes("video/webm")) return "webm";
  if (ct.includes("video/quicktime")) return "mov";
  if (ct.includes("video/x-matroska") || ct.includes("video/mkv")) return "mkv";

  // audio (на майбутнє)
  if (ct.includes("audio/mpeg")) return "mp3";
  if (ct.includes("audio/wav")) return "wav";
  if (ct.includes("audio/webm")) return "webm";

  return fallback;
}

function safeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 180);
}

function stripQueryFromUrl(url: string) {
  try {
    const u = new URL(url);
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Якщо filename не передали — пробуємо взяти з URL.
 * Якщо не вийшло — генеруємо.
 */
function filenameFromUrl(url: string) {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop() || "";
    return last ? safeFilename(last) : "";
  } catch {
    return "";
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const url = String(body?.url ?? "").trim();
    if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });

    const origin = new URL(req.url).origin;

    // 1) Fetch remote bytes server-side (bypass CORS)
    const remoteRes = await fetch(url, { method: "GET" });

    if (!remoteRes.ok) {
      const txt = await remoteRes.text().catch(() => "");
      return NextResponse.json(
        { error: `Failed to fetch remote: ${remoteRes.status}`, details: txt.slice(0, 500) },
        { status: 502 }
      );
    }

    const contentType = String(
      body?.contentType ?? remoteRes.headers.get("content-type") ?? "application/octet-stream"
    ).trim();

    // ⛔️ Для великих відео Buffer може бути важким.
    // Але для простоти залишаємо як є.
    // Якщо треба — я дам stream-версію.
    const buf = Buffer.from(await remoteRes.arrayBuffer());

    // 2) presign-put endpoint -> uploadUrl + key
    const ext = guessExt(contentType);
    const urlName = filenameFromUrl(stripQueryFromUrl(url));

    // якщо filename передали — ок, якщо ні — беремо з URL, якщо і там нема — генеруємо
    const rawFilename = String(body?.filename ?? urlName ?? "").trim();
    const filename = safeFilename(
      rawFilename && rawFilename.includes(".")
        ? rawFilename
        : rawFilename
          ? `${rawFilename}.${ext}`
          : `asset_${Date.now()}.${ext}`
    );

    const presignRes = await fetch(`${origin}/api/upload/presign-put`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename, contentType }),
    });

    const pres = await presignRes.json().catch(() => ({}));
    if (!presignRes.ok || !pres?.uploadUrl || !pres?.key) {
      return NextResponse.json({ error: "Presign failed", details: pres }, { status: 500 });
    }

    // 3) PUT upload bytes to R2 via presigned url
    const putRes = await fetch(pres.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: buf,
    });

    if (!putRes.ok) {
      const txt = await putRes.text().catch(() => "");
      return NextResponse.json(
        { error: `Upload to R2 failed: ${putRes.status}`, details: txt.slice(0, 500) },
        { status: 502 }
      );
    }

    const base = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
    const publicUrl = base ? `${base.replace(/\/+$/, "")}/${String(pres.key).replace(/^\/+/, "")}` : null;

    return NextResponse.json({
      ok: true,
      key: pres.key,
      publicUrl,
      contentType,
      filename,
      size: buf.length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
