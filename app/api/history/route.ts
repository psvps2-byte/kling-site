// app/api/history/route.ts
import { NextResponse } from "next/server";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { presignGet } from "@/lib/r2";

export const runtime = "nodejs";

// ✅ вимкнути кеш Next для цього route handler
export const dynamic = "force-dynamic";
export const revalidate = 0;

type StoredEntry = {
  id: string;
  createdAt: number;
  prompt?: string;

  // legacy / mixed
  urls?: string[];
  imageUrls?: string[];
  image_urls?: string[];

  // new
  r2Keys?: string[];
};

type ApiEntry = {
  id: string;
  createdAt: number;
  urls: string[];
  prompt?: string;
  r2Keys?: string[];
};

const HISTORY_OBJECT_KEY = process.env.R2_HISTORY_KEY || "meta/history.json";

// --------- ENV (обовʼязково) ---------
// R2_ENDPOINT: https://<accountid>.r2.cloudflarestorage.com
// R2_ACCESS_KEY_ID: ...
// R2_SECRET_ACCESS_KEY: ...
// R2_BUCKET: твій bucket (наприклад "vilna")
// -------------------------------------

function getR2Client() {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Missing R2 env. Need R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY"
    );
  }

  return new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function getBucket() {
  const bucket = process.env.R2_BUCKET;
  if (!bucket) throw new Error("Missing R2_BUCKET env");
  return bucket;
}

async function streamToString(body: any): Promise<string> {
  // AWS SDK v3 returns a stream in Node runtime
  if (!body) return "";
  if (typeof body === "string") return body;

  // Node.js Readable
  const chunks: Buffer[] = [];
  for await (const chunk of body as any) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

function uniqStrings(arr: any[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of arr) {
    const s = typeof v === "string" ? v.trim() : "";
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function pickUrls(it: StoredEntry): string[] {
  // priority: urls -> imageUrls -> image_urls
  const a = Array.isArray(it.urls) ? it.urls : [];
  const b = Array.isArray(it.imageUrls) ? it.imageUrls : [];
  const c = Array.isArray(it.image_urls) ? it.image_urls : [];
  return uniqStrings([...a, ...b, ...c]);
}

function noStoreJson(data: any, init?: { status?: number }) {
  return NextResponse.json(data, {
    status: init?.status ?? 200,
    headers: {
      "Cache-Control":
        "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
      "Surrogate-Control": "no-store",
    },
  });
}

async function readHistoryRaw(): Promise<StoredEntry[]> {
  const client = getR2Client();
  const bucket = getBucket();

  try {
    const res = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: HISTORY_OBJECT_KEY,
      })
    );

    const raw = await streamToString(res.Body);
    let parsed: any = [];
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = [];
    }

    const arr = Array.isArray(parsed) ? parsed : [];

    const items: StoredEntry[] = arr
      .map((it: any) => {
        const id = String(it?.id ?? it?.taskId ?? it?.task_id ?? "").trim();
        if (!id) return null;

        const createdAt =
          Number(
            it?.createdAt ??
              it?.created_at ??
              it?.updatedAt ??
              it?.updated_at ??
              Date.now()
          ) || Date.now();

        const prompt = it?.prompt ? String(it.prompt) : undefined;

        const urls = Array.isArray(it?.urls) ? it.urls : undefined;
        const imageUrls = Array.isArray(it?.imageUrls) ? it.imageUrls : undefined;
        const image_urls = Array.isArray(it?.image_urls) ? it.image_urls : undefined;

        const r2Keys = Array.isArray(it?.r2Keys) ? it.r2Keys : undefined;

        return {
          id,
          createdAt,
          prompt,
          urls: urls ? uniqStrings(urls) : undefined,
          imageUrls: imageUrls ? uniqStrings(imageUrls) : undefined,
          image_urls: image_urls ? uniqStrings(image_urls) : undefined,
          r2Keys: r2Keys ? uniqStrings(r2Keys) : undefined,
        } as StoredEntry;
      })
      .filter(Boolean) as StoredEntry[];

    items.sort((a, b) => b.createdAt - a.createdAt);
    return items;
  } catch (e: any) {
    // якщо обʼєкта нема — повертаємо порожній масив
    const msg = String(e?.name || e?.Code || e?.message || "");
    const status = Number(e?.$metadata?.httpStatusCode || 0);
    if (status === 404 || msg.includes("NoSuchKey") || msg.includes("NotFound")) {
      return [];
    }
    throw e;
  }
}

async function writeHistoryRaw(items: StoredEntry[]) {
  const client = getR2Client();
  const bucket = getBucket();

  const body = JSON.stringify(items, null, 2);

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: HISTORY_OBJECT_KEY,
      Body: body,
      ContentType: "application/json; charset=utf-8",
      // R2 ігнорує деякі cache headers як metadata, але краще поставити
      CacheControl: "no-store",
    })
  );
}

export async function GET() {
  try {
    const items = await readHistoryRaw();
    const expiresIn = 60 * 30; // 30 хв

    const apiItems: ApiEntry[] = await Promise.all(
      items.map(async (it) => {
        // Якщо є r2Keys — генеруємо тимчасові URL-и
        if (it.r2Keys?.length) {
          const urls = await Promise.all(
            it.r2Keys.map((k) => presignGet(k, expiresIn))
          );
          return {
            id: it.id,
            createdAt: it.createdAt,
            prompt: it.prompt,
            urls,
            r2Keys: it.r2Keys,
          };
        }

        // Інакше беремо urls/imageUrls/image_urls
        const urls = pickUrls(it);
        return { id: it.id, createdAt: it.createdAt, prompt: it.prompt, urls };
      })
    );

    return noStoreJson(apiItems);
  } catch (e: any) {
    console.error(e);
    return noStoreJson(
      { error: "Failed to read history", details: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const id = String(body?.id ?? "").trim();
    if (!id) return noStoreJson({ error: "Missing id" }, { status: 400 });

    const createdAt = Number(body?.createdAt ?? Date.now()) || Date.now();
    const prompt = body?.prompt ? String(body.prompt) : undefined;

    const urlsIn = Array.isArray(body?.urls) ? body.urls : [];
    const urls = uniqStrings(urlsIn);

    const r2KeysIn = Array.isArray(body?.r2Keys) ? body.r2Keys : [];
    const r2Keys = uniqStrings(r2KeysIn);

    const items = await readHistoryRaw();
    const idx = items.findIndex((x) => x.id === id);

    if (idx >= 0) {
      const prev = items[idx];

      const mergedUrls = uniqStrings([
        ...(prev.urls ?? []),
        ...(prev.imageUrls ?? []),
        ...(prev.image_urls ?? []),
        ...urls,
      ]);

      const mergedR2 = uniqStrings([...(prev.r2Keys ?? []), ...r2Keys]);

      // ✅ ВАЖЛИВО: робимо createdAt "найновішим", а не залишаємо старий
      const prevCreated = Number(prev.createdAt || 0);
      const nextCreated = Number(createdAt || Date.now());

      items[idx] = {
        ...prev,
        createdAt: Math.max(prevCreated, nextCreated),
        prompt: prompt ?? prev.prompt,
        urls: mergedUrls.length ? mergedUrls : prev.urls,
        r2Keys: mergedR2.length ? mergedR2 : prev.r2Keys,
      };
    } else {
      items.unshift({
        id,
        createdAt,
        prompt,
        urls: urls.length ? urls : undefined,
        r2Keys: r2Keys.length ? r2Keys : undefined,
      });
    }

    items.sort((a, b) => b.createdAt - a.createdAt);
    await writeHistoryRaw(items);

    return noStoreJson({ ok: true });
  } catch (e: any) {
    console.error(e);
    return noStoreJson(
      { error: "Failed to write history", details: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = String(searchParams.get("id") ?? "").trim();
    if (!id) return noStoreJson({ error: "Missing id" }, { status: 400 });

    const items = await readHistoryRaw();
    const before = items.length;
    const next = items.filter((x) => x.id !== id);

    if (next.length === before) {
      // не знайшли — це не фатальна помилка
      return noStoreJson({ ok: true, removed: false });
    }

    await writeHistoryRaw(next);
    return noStoreJson({ ok: true, removed: true });
  } catch (e: any) {
    console.error(e);
    return noStoreJson(
      { error: "Failed to delete history", details: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
