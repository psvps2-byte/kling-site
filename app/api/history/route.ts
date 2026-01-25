import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { presignGet } from "@/lib/r2";

export const runtime = "nodejs";

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

type ApiEntry = { id: string; createdAt: number; urls: string[]; prompt?: string };

const HISTORY_PATH = path.join(process.cwd(), "data", "history.json");

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

async function readHistoryRaw(): Promise<StoredEntry[]> {
  let raw = "[]";
  try {
    raw = await fs.readFile(HISTORY_PATH, "utf-8");
  } catch {
    raw = "[]";
  }

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
        Number(it?.createdAt ?? it?.created_at ?? it?.updatedAt ?? it?.updated_at ?? Date.now()) || Date.now();

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
}

async function writeHistoryRaw(items: StoredEntry[]) {
  await fs.mkdir(path.dirname(HISTORY_PATH), { recursive: true });
  await fs.writeFile(HISTORY_PATH, JSON.stringify(items, null, 2), "utf-8");
}

function pickUrls(it: StoredEntry): string[] {
  // priority: urls -> imageUrls -> image_urls
  const a = Array.isArray(it.urls) ? it.urls : [];
  const b = Array.isArray(it.imageUrls) ? it.imageUrls : [];
  const c = Array.isArray(it.image_urls) ? it.image_urls : [];
  return uniqStrings([...a, ...b, ...c]);
}

export async function GET() {
  try {
    const items = await readHistoryRaw();

    const expiresIn = 60 * 30; // 30 хв
    const apiItems: ApiEntry[] = await Promise.all(
      items.map(async (it) => {
        // Якщо є r2Keys — генеруємо тимчасові URL-и
        if (it.r2Keys?.length) {
          const urls = await Promise.all(it.r2Keys.map((k) => presignGet(k, expiresIn)));
          return { id: it.id, createdAt: it.createdAt, prompt: it.prompt, urls };
        }

        // Інакше беремо urls/imageUrls/image_urls
        const urls = pickUrls(it);
        return { id: it.id, createdAt: it.createdAt, prompt: it.prompt, urls };
      })
    );

    return NextResponse.json(apiItems);
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { error: "Failed to read history", details: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const id = String(body?.id ?? "").trim();
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const createdAt = Number(body?.createdAt ?? Date.now()) || Date.now();
    const prompt = body?.prompt ? String(body.prompt) : undefined;

    const urlsIn = Array.isArray(body?.urls) ? body.urls : [];
    const urls = uniqStrings(urlsIn);

    const r2KeysIn = Array.isArray(body?.r2Keys) ? body.r2Keys : [];
    const r2Keys = uniqStrings(r2KeysIn);

    const items = await readHistoryRaw();

    const idx = items.findIndex((x) => x.id === id);
    if (idx >= 0) {
      // update existing
      const prev = items[idx];
      const mergedUrls = uniqStrings([...(prev.urls ?? []), ...(prev.imageUrls ?? []), ...(prev.image_urls ?? []), ...urls]);
      const mergedR2 = uniqStrings([...(prev.r2Keys ?? []), ...r2Keys]);

      items[idx] = {
        ...prev,
        createdAt: prev.createdAt || createdAt,
        prompt: prompt ?? prev.prompt,
        urls: mergedUrls.length ? mergedUrls : prev.urls,
        r2Keys: mergedR2.length ? mergedR2 : prev.r2Keys,
      };
    } else {
      // insert new
      items.unshift({
        id,
        createdAt,
        prompt,
        urls: urls.length ? urls : undefined,
        r2Keys: r2Keys.length ? r2Keys : undefined,
      });
    }

    // newest first
    items.sort((a, b) => b.createdAt - a.createdAt);

    await writeHistoryRaw(items);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { error: "Failed to write history", details: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}
