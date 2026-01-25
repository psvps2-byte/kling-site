import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";
import fs from "fs/promises";
import path from "path";

async function makeToken(ak: string, sk: string) {
  const now = Math.floor(Date.now() / 1000);
  const secret = new TextEncoder().encode(sk);

  return await new SignJWT({})
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(ak)
    .setNotBefore(now - 5)
    .setExpirationTime(now + 1800)
    .sign(secret);
}

function deriveExtFromContentType(ct?: string, fallbackUrl?: string) {
  if (ct) {
    if (ct.includes("png")) return ".png";
    if (ct.includes("jpeg") || ct.includes("jpg")) return ".jpg";
    if (ct.includes("webp")) return ".webp";
    if (ct.includes("gif")) return ".gif";
  }
  if (fallbackUrl) {
    const m = String(fallbackUrl).match(/\.([a-zA-Z0-9]{3,4})(?:\?|$)/);
    return m ? `.${m[1]}` : ".png";
  }
  return ".png";
}

export async function GET(req: NextRequest) {
  const baseUrl = process.env.KLING_BASE_URL;
  const ak = process.env.KLING_ACCESS_KEY;
  const sk = process.env.KLING_SECRET_KEY;

  if (!baseUrl || !ak || !sk) {
    return NextResponse.json({ error: "Missing KLING env vars" }, { status: 500 });
  }

  const task_id = req.nextUrl.searchParams.get("task_id");
  if (!task_id) return NextResponse.json({ error: "Missing task_id" }, { status: 400 });

  const token = await makeToken(ak, sk);

  const upstream = await fetch(`${baseUrl}/v1/images/generations/${task_id}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });

  const text = await upstream.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!upstream.ok) {
    return NextResponse.json({ error: "Kling status error", details: data }, { status: upstream.status });
  }

  // collect candidate remote urls
  const candidates: string[] = [];

  if (Array.isArray(data?.data?.works)) {
    for (const w of data.data.works) {
      const url =
        w?.resource?.resource_url ??
        w?.resource?.url ??
        w?.resource?.download_url ??
        w?.resource?.image_url;
      if (typeof url === "string") candidates.push(url);
    }
  }

  if (Array.isArray(data?.data?.task_result?.images)) {
    for (const img of data.data.task_result.images) {
      const url = img?.url ?? img?.image_url ?? img?.resource_url ?? img?.download_url;
      if (typeof url === "string") candidates.push(url);
    }
  }

  if (Array.isArray(data?.data?.images)) {
    for (const img of data.data.images) {
      const url = img?.url ?? img?.image_url ?? img?.resource_url ?? img?.download_url;
      if (typeof url === "string") candidates.push(url);
    }
  }

  const remoteUrls = Array.from(new Set(candidates)).filter((u) => u.startsWith("https://"));
  const status = data?.data?.task_status ?? data?.data?.status ?? data?.status ?? "unknown";

  const localPaths: string[] = [];

  // download only if succeeded
  const succeeded = /succeed|success|succeeded/i.test(String(status));

  if (remoteUrls.length > 0 && succeeded) {
    const PUBLIC_DIR = path.join(process.cwd(), "public");
    const OUT_DIR = path.join(PUBLIC_DIR, "generated");
    await fs.mkdir(OUT_DIR, { recursive: true });

    for (let i = 0; i < remoteUrls.length; i++) {
      const remote = remoteUrls[i];

      try {
        const resp = await fetch(remote);
        if (!resp.ok) continue;

        const ct = resp.headers.get("content-type") ?? undefined;
        const ext = deriveExtFromContentType(ct, remote);
        const filename = `${task_id}-${i + 1}${ext}`;
        const outFile = path.join(OUT_DIR, filename);

        const arrayBuf = await resp.arrayBuffer();
        await fs.writeFile(outFile, Buffer.from(arrayBuf));

        localPaths.push(`/generated/${filename}`);
      } catch (e) {
        console.error("download error", remote, e);
      }
    }

    // update history
    if (localPaths.length > 0) {
      const DATA_DIR = path.join(process.cwd(), "data");
      const FILE_PATH = path.join(DATA_DIR, "history.json");
      await fs.mkdir(DATA_DIR, { recursive: true });

      let arr: any[] = [];
      try {
        const txt = await fs.readFile(FILE_PATH, "utf-8");
        const parsed = JSON.parse(txt);
        if (Array.isArray(parsed)) arr = parsed;
      } catch {
        arr = [];
      }

      const idx = arr.findIndex(
        (it) => String(it?.id) === String(task_id) || String(it?.taskId) === String(task_id)
      );

      const prompt =
        data?.data?.task_input?.prompt ??
        data?.data?.task_result?.prompt ??
        data?.data?.prompt ??
        "";

      if (idx >= 0) {
        arr[idx].status = "done";
        arr[idx].imageUrls = localPaths;
        arr[idx].updatedAt = Date.now();
      } else {
        arr.push({
          id: String(task_id),
          taskId: String(task_id),
          prompt: String(prompt),
          imageUrls: localPaths,
          status: "done",
          createdAt: Date.now(),
        });
      }

      await fs.writeFile(FILE_PATH, JSON.stringify(arr, null, 2), "utf-8");
    }
  }

  return NextResponse.json({ status, imageUrls: localPaths });
}
