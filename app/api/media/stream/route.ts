import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIRECT_HOSTS = new Set(["cdn.vilna.pro"]);

function addHostFromEnv(value?: string) {
  if (!value) return;
  try {
    const host = new URL(value).hostname;
    if (host) DIRECT_HOSTS.add(host);
  } catch {
    // ignore malformed env values
  }
}

addHostFromEnv(process.env.R2_PUBLIC_BASE);
addHostFromEnv(process.env.R2_PUBLIC_BASE_URL);
addHostFromEnv(process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL);

function isAllowedUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "https:" && DIRECT_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

function pickHeader(headers: Headers, name: string) {
  const value = headers.get(name);
  return value ? [name, value] as const : null;
}

function buildResponseHeaders(upstreamHeaders: Headers) {
  const headers = new Headers();
  const allowed = [
    "accept-ranges",
    "cache-control",
    "content-length",
    "content-range",
    "content-type",
    "etag",
    "last-modified",
  ];

  for (const name of allowed) {
    const pair = pickHeader(upstreamHeaders, name);
    if (pair) headers.set(pair[0], pair[1]);
  }

  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  return headers;
}

async function proxy(req: NextRequest) {
  const rawUrl = (req.nextUrl.searchParams.get("url") || "").trim();
  if (!rawUrl || !isAllowedUrl(rawUrl)) {
    return NextResponse.json({ error: "Invalid media URL" }, { status: 400 });
  }

  const upstreamHeaders = new Headers();
  const range = req.headers.get("range");
  if (range) upstreamHeaders.set("range", range);

  const ifRange = req.headers.get("if-range");
  if (ifRange) upstreamHeaders.set("if-range", ifRange);

  const upstream = await fetch(rawUrl, {
    method: req.method,
    headers: upstreamHeaders,
    cache: "no-store",
    redirect: "follow",
  });

  if (!upstream.ok && upstream.status !== 206) {
    return NextResponse.json(
      { error: "Failed to load media", status: upstream.status },
      { status: upstream.status }
    );
  }

  return new NextResponse(req.method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    headers: buildResponseHeaders(upstream.headers),
  });
}

export async function GET(req: NextRequest) {
  return proxy(req);
}

export async function HEAD(req: NextRequest) {
  return proxy(req);
}
