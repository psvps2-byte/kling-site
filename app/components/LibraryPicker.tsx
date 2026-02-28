"use client";

import { useEffect, useMemo, useState } from "react";
import { getLang, t, type Lang } from "../i18n";

type Item = {
  id: string;
  kind: "image" | "video";
  url: string;
  createdAt?: string;
  prompt?: string;
};

function isVideoUrl(url: string) {
  return !!url.match(/\.(mp4|webm|mov|mkv)(\?|#|$)/i);
}

// додає/замінює query параметр
function withParam(url: string, key: string, value: string) {
  try {
    const u = new URL(url);
    u.searchParams.set(key, value);
    return u.toString();
  } catch {
    return url;
  }
}

// прибирає параметри превʼю, щоб на onPick віддавати оригінал
function stripPreviewParams(url: string) {
  try {
    const u = new URL(url);
    u.searchParams.delete("w");
    u.searchParams.delete("frame");
    u.searchParams.delete("thumb");
    u.searchParams.delete("poster");
    return u.toString();
  } catch {
    return url;
  }
}

// як в історії: просимо маленьку версію через ?w=600
function thumbUrl(url: string) {
  return withParam(url, "w", "600");
}

/**
 * Спроба зробити статичний постер для відео (без програвання) через canvas.
 * Якщо CORS не дозволяє — поверне null, тоді буде fallback на thumbUrl(url).
 */
async function capturePoster(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    // важливо: якщо відео з іншого домену без CORS — canvas буде tainted
    v.crossOrigin = "anonymous";
    v.muted = true;
    v.playsInline = true;
    v.preload = "metadata";
    v.src = url;

    let done = false;

    const cleanup = () => {
      if (done) return;
      done = true;
      try {
        v.pause();
      } catch {}
      try {
        v.removeAttribute("src");
        v.load();
      } catch {}
      // не додаємо в DOM, тому просто GC
    };

    const fail = () => {
      cleanup();
      resolve(null);
    };

    v.onerror = fail;

    v.onloadedmetadata = () => {
      // інколи 0 кадр чорний — пробуємо 0.1с
      try {
        const target = Math.min(0.1, Math.max(0, (v.duration || 1) - 0.01));
        v.currentTime = target;
      } catch {
        // якщо seek не дозволений — спробуємо з onloadeddata
      }
    };

    v.onloadeddata = () => {
      // якщо metadata ок, але seek не спрацював — спробуємо з 0 кадром
      if (v.readyState >= 2 && (v.currentTime === 0 || Number.isNaN(v.currentTime))) {
        try {
          v.currentTime = 0;
        } catch {
          // нічого
        }
      }
    };

    v.onseeked = () => {
      try {
        const w = v.videoWidth || 0;
        const h = v.videoHeight || 0;
        if (!w || !h) return fail();

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;

        const ctx = canvas.getContext("2d");
        if (!ctx) return fail();

        ctx.drawImage(v, 0, 0, w, h);

        // jpeg достатньо для прев’ю
        const dataUrl = canvas.toDataURL("image/jpeg", 0.86);
        cleanup();
        resolve(dataUrl);
      } catch {
        // найчастіше сюди потрапляємо при CORS (tainted canvas)
        fail();
      }
    };

    // страховка: якщо onseeked не настане
    setTimeout(() => {
      if (!done) fail();
    }, 4000);
  });
}

export default function LibraryPicker({
  open,
  kind,
  onPick,
  onClose,
}: {
  open: boolean;
  kind: "image" | "video";
  onPick: (url: string) => void;
  onClose: () => void;
}) {
  const [lang, setLangState] = useState<Lang>("uk");
  const dict = useMemo(() => t(lang), [lang]);

  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [videoAspect, setVideoAspect] = useState<Record<string, number>>({});

  // poster cache: key = video url, value = dataURL
  const [posters, setPosters] = useState<Record<string, string>>({});

  useEffect(() => {
    setLangState(getLang());
  }, []);

  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();

    (async () => {
      try {
        setLoading(true);
        setError(null);
        setOffset(0);
        setHasMore(false);
        setItems([]);

        const res = await fetch(`/api/history?kind=${kind}&limit=10&offset=0`, {
          signal: controller.signal,
          cache: "no-store",
        });

        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || "Failed to load");

        const arr = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
        setItems(Array.isArray(arr) ? arr : []);
        setOffset(Array.isArray(arr) ? arr.length : 0);
        setHasMore(Boolean(data?.pagination?.hasMore));
      } catch (e: any) {
        if (controller.signal.aborted) return;
        setError(String(e?.message || e));
        setItems([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [open, kind]);

  async function loadMore() {
    try {
      setLoadingMore(true);
      setError(null);

      const res = await fetch(`/api/history?kind=${kind}&limit=10&offset=${offset}`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Failed to load more");

      const arr = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
      if (Array.isArray(arr) && arr.length > 0) {
        setItems((prev) => [...prev, ...arr]);
        setOffset((prev) => prev + arr.length);
      }
      setHasMore(Boolean(data?.pagination?.hasMore));
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoadingMore(false);
    }
  }

  // генеруємо статичні постери для відео (щоб не програвалось)
  useEffect(() => {
    if (!open) return;

    let alive = true;

    (async () => {
      const vids = items.filter((it) => {
        const vid = it.kind === "video" || (it.url ? isVideoUrl(it.url) : false);
        return vid && !!it.url;
      });

      // по черзі, щоб не навантажувати
      for (const it of vids) {
        if (!alive) return;
        if (!it.url) continue;
        if (posters[it.url]) continue;

        const p = await capturePoster(it.url);
        if (!alive) return;

        if (p) {
          setPosters((prev) => ({ ...prev, [it.url]: p }));
        } else {
          // якщо не вийшло (CORS) — не повторюємо нескінченно
          setPosters((prev) => ({ ...prev, [it.url]: "" }));
        }
      }
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, items]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100000,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(920px, 100%)",
          maxHeight: "calc(100dvh - 32px)",
          overflow: "auto",
          background: "rgba(12, 14, 20, 0.95)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 18,
          padding: 16,
          color: "white",
          boxShadow: "0 18px 60px rgba(0,0,0,0.6)",
          backdropFilter: "blur(12px) saturate(120%)",
          WebkitBackdropFilter: "blur(12px) saturate(120%)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header: title + bigger close, WITHOUT language switch */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 700 }}>{dict.history}</div>

          <button
            className="ios-btn ios-btn--ghost"
            style={{
              padding: "10px 16px",
              fontSize: 15,
              borderRadius: 12,
            }}
            onClick={onClose}
          >
            {dict.close}
          </button>
        </div>

        {loading && <div style={{ opacity: 0.8 }}>{dict.processing}</div>}
        {error && <div style={{ color: "rgba(255,120,120,0.95)", marginBottom: 8 }}>{error}</div>}

        {!loading && !error && items.length === 0 && <div style={{ opacity: 0.8 }}>{dict.libraryEmpty}</div>}

        {/* Grid: ONLY <img> previews (static posters for video) */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            gap: 10,
            marginTop: 8,
          }}
        >
          {items.map((it) => {
            const vid = it.kind === "video" || (it.url ? isVideoUrl(it.url) : false);
            const ratio = it.url && vid ? videoAspect[it.url] : undefined;
            const cardAspect = vid ? (ratio && ratio > 0 ? ratio : 9 / 16) : 1;
            const mediaUrl = stripPreviewParams(it.url);

            // src:
            // - для video: беремо dataURL постера (якщо є), інакше fallback на thumbUrl(url)
            // - для image: thumbUrl(url)
            const poster = it.url && vid ? posters[it.url] : undefined;
            const src = it.url ? (vid ? poster || thumbUrl(it.url) : thumbUrl(it.url)) : "";

            return (
              <button
                key={`${it.id}-${it.url}`}
                type="button"
                onClick={() => onPick(stripPreviewParams(it.url))}
                style={{
                  position: "relative",
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.04)",
                  borderRadius: 14,
                  padding: 0,
                  overflow: "hidden",
                  cursor: "pointer",
                  height: vid ? "auto" : 140,
                  aspectRatio: String(cardAspect),
                }}
                title={it.prompt || it.url}
              >
                {/* blurred bg */}
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    backgroundImage: !vid && src ? `url("${src}")` : undefined,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    filter: "blur(14px)",
                    transform: "scale(1.08)",
                    opacity: 0.45,
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "rgba(0,0,0,0.18)",
                  }}
                />

                {vid && it.url ? (
                  <video
                    src={mediaUrl}
                    muted
                    playsInline
                    preload="metadata"
                    onLoadedMetadata={(e) => {
                      const v = e.currentTarget;
                      const w = v.videoWidth || 0;
                      const h = v.videoHeight || 0;
                      if (!it.url || !w || !h) return;
                      const next = w / h;
                      if (!Number.isFinite(next) || next <= 0) return;
                      setVideoAspect((prev) => {
                        if (prev[it.url] === next) return prev;
                        return { ...prev, [it.url]: next };
                      });
                    }}
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                      display: "block",
                      background: "rgba(0,0,0,0.35)",
                    }}
                  />
                ) : src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={src}
                    alt="history"
                    loading="lazy"
                    style={{
                      position: "absolute",
                      inset: 0,
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "rgba(255,255,255,0.65)",
                      fontSize: 12,
                    }}
                  >
                    {dict.processing}
                  </div>
                )}

                {/* video badge + play overlay */}
                {vid && (
                  <>
                    <div
                      style={{
                        position: "absolute",
                        left: 8,
                        bottom: 8,
                        padding: "3px 7px",
                        borderRadius: 999,
                        fontSize: 11,
                        background: "rgba(0,0,0,0.55)",
                        border: "1px solid rgba(255,255,255,0.18)",
                      }}
                    >
                      Video
                    </div>

                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        pointerEvents: "none",
                      }}
                    >
                      <div
                        style={{
                          width: 46,
                          height: 46,
                          borderRadius: 999,
                          background: "rgba(0,0,0,0.45)",
                          border: "1px solid rgba(255,255,255,0.2)",
                          display: "grid",
                          placeItems: "center",
                          backdropFilter: "blur(6px)",
                          WebkitBackdropFilter: "blur(6px)",
                        }}
                      >
                        <div
                          style={{
                            width: 0,
                            height: 0,
                            borderLeft: "14px solid rgba(255,255,255,0.9)",
                            borderTop: "9px solid transparent",
                            borderBottom: "9px solid transparent",
                            marginLeft: 2,
                          }}
                        />
                      </div>
                    </div>
                  </>
                )}
              </button>
            );
          })}
        </div>

        {!loading && !error && hasMore && (
          <div style={{ display: "flex", justifyContent: "center", marginTop: 14 }}>
            <button
              type="button"
              className="ios-btn ios-btn--ghost"
              onClick={loadMore}
              disabled={loadingMore}
              style={{ minWidth: 170 }}
            >
              {loadingMore
                ? lang === "uk"
                  ? "Завантаження..."
                  : "Loading..."
                : lang === "uk"
                  ? "Завантажити ще"
                  : "Load more"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
