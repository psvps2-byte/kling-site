import { NextResponse } from "next/server";
import { safeFetch, readJsonOrRaw, stringifyFetchError } from "@/lib/safeFetch";

export const runtime = "nodejs";

/**
 * Guess extension from Content-Type
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

  // video
  if (ct.includes("video/mp4")) return "mp4";
  if (ct.includes("video/webm")) return "webm";
  if (ct.includes("video/quicktime")) return "mov";
  if (ct.includes("video/x-matroska") || ct.includes("video/mkv")) return "mkv";

  // audio
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
    if (!url) {
      return NextResponse.json({ error: "Missing url" }, { status: 400 });
    }

    // ---------------------------------------------------
    // 1) Fetch remote file (safeFetch)
    // ---------------------------------------------------
    let remoteRes: Response;
    try {
      remoteRes = await safeFetch(
        url,
        {
          method: "GET",
          headers: {
            Accept: "*/*",
            "User-Agent": "kling-site/1.0",
          },
        },
        { timeoutMs: 30_000, retries: 2 }
      );
    } catch (e: any) {
      return NextResponse.json(
        { error: "Remote fetch failed", details: stringifyFetchError(e), url },
        { status: 502 }
      );
    }

    if (!remoteRes.ok) {
      const txt = await remoteRes.text().catch(() => "");
      return NextResponse.json(
        { error: `Failed to fetch remote: ${remoteRes.status}`, details: txt.slice(0, 500), url },
        { status: 502 }
      );
    }

    const contentType = String(
      body?.contentType ?? remoteRes.headers.get("content-type") ?? "application/octet-stream"
    ).trim();

    const buf = Buffer.from(await remoteRes.arrayBuffer());

    // ---------------------------------------------------
    // 2) Presign PUT (ВАЖЛИВО: тільки absolute URL)
    // ---------------------------------------------------
    const ext = guessExt(contentType);
    const urlName = filenameFromUrl(stripQueryFromUrl(url));

    const rawFilename = String(body?.filename ?? urlName ?? "").trim();
    const filename = safeFilename(
      rawFilename && rawFilename.includes(".")
        ? rawFilename
        : rawFilename
          ? `${rawFilename}.${ext}`
          : `asset_${Date.now()}.${ext}`
    );

    const presignUrl = new URL("/api/upload/presign-put", `https://${req.headers.get("host")}`).toString();

    let presignRes: Response;
    try {
      presignRes = await safeFetch(
        presignUrl,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename, contentType }),
        },
        { timeoutMs: 15_000, retries: 2 }
      );
    } catch (e: any) {
      return NextResponse.json(
        { error: "Presign fetch failed", details: stringifyFetchError(e), presignUrl },
        { status: 502 }
      );
    }

    const pres = await readJsonOrRaw(presignRes);

    if (!presignRes.ok || !pres?.uploadUrl || !pres?.key) {
      return NextResponse.json({ error: "Presign failed", details: pres }, { status: 500 });
    }

    // ---------------------------------------------------
    // 3) PUT upload to R2 (safeFetch)
    // ---------------------------------------------------
    let putRes: Response;
    try {
      putRes = await safeFetch(
        pres.uploadUrl,
        {
          method: "PUT",
          headers: { "Content-Type": contentType },
          body: buf,
        },
        { timeoutMs: 60_000, retries: 2 }
      );
    } catch (e: any) {
      return NextResponse.json(
        { error: "Upload to R2 failed", details: stringifyFetchError(e) },
        { status: 502 }
      );
    }

    if (!putRes.ok) {
      const txt = await putRes.text().catch(() => "");
      return NextResponse.json(
        { error: `Upload to R2 failed: ${putRes.status}`, details: txt.slice(0, 500) },
        { status: 502 }
      );
    }

    const base = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
    const publicUrl = base
      ? `${base.replace(/\/+$/, "")}/${String(pres.key).replace(/^\/+/, "")}`
      : null;

    return NextResponse.json({
      ok: true,
      key: pres.key,
      publicUrl,
      contentType,
      filename,
      size: buf.length,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: "Server error", details: stringifyFetchError(e) },
      { status: 500 }
    );
  }
}
