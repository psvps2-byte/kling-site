// lib/safeFetch.ts

export async function safeFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  opts: { timeoutMs?: number; retries?: number } = {}
) {
  const { timeoutMs = 15_000, retries = 0 } = opts;

  let lastErr: any;

  for (let i = 0; i <= retries; i++) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(input, {
        ...init,
        signal: controller.signal,
      });
      clearTimeout(id);
      return res;
    } catch (e) {
      clearTimeout(id);
      lastErr = e;
      if (i === retries) throw e;
    }
  }

  throw lastErr;
}

export async function readJsonOrRaw(res: Response) {
  const txt = await res.text();
  try {
    return JSON.parse(txt);
  } catch {
    return { raw: txt };
  }
}

export function stringifyFetchError(e: any) {
  return {
    name: e?.name,
    message: e?.message,
    cause: e?.cause,
    stack: e?.stack,
  };
}
