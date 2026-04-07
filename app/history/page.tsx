"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { getLang, setLang, t, type Lang } from "../i18n";

type Entry = {
  id: string;
  createdAt: number;
  kind?: string;
  status?: string;
  urls: string[];
  prompt?: string;
  r2Keys?: string[];
};

type DisplayItem = {
  // унікальний id для кожного превʼю
  uid: string;

  // посилання на оригінальний запис
  entryId: string;
  createdAt: number;
  prompt?: string;

  // конкретний файл з масиву urls
  url: string;
  urlIndex: number;

  // відповідний r2Key (якщо є)
  r2Key?: string;
  pendingKind?: "photo" | "video";
  status?: string;
};

type PendingGeneration = {
  id: string;
  kind: "photo" | "video";
  createdAt: number;
  prompt: string;
};

const PENDING_GENERATIONS_KEY = "vilna_pending_generations_v1";
const PENDING_TTL_MS = 60 * 60 * 1000;
const STALE_PENDING_MS = 90 * 60 * 1000;

function readPendingGenerations(): PendingGeneration[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PENDING_GENERATIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed.filter((x: any) => {
      const createdAt = Number(x?.createdAt || 0);
      const id = typeof x?.id === "string" ? x.id : "";
      return id && createdAt > 0 && now - createdAt <= PENDING_TTL_MS;
    });
  } catch {
    return [];
  }
}

async function readJsonOrRaw(res: Response) {
  const rawText = await res.text();
  try {
    return JSON.parse(rawText);
  } catch {
    return { raw: rawText };
  }
}

function isVideoUrl(url: string) {
  return !!url.match(/\.(mp4|webm|mov|mkv)(\?|$)/i);
}

function inferPendingKind(kind?: string): "photo" | "video" {
  const upper = String(kind || "").toUpperCase();
  return upper.includes("VIDEO") || upper.includes("I2V") ? "video" : "photo";
}

// додає або замінює параметр у URL
function withParam(url: string, key: string, value: string) {
  try {
    const u = new URL(url);
    u.searchParams.set(key, value);
    return u.toString();
  } catch {
    // якщо раптом не валідний URL — повернемо як є
    return url;
  }
}

// прибирає параметр w (щоб модалка відкривала оригінал)
function withoutW(url: string) {
  try {
    const u = new URL(url);
    u.searchParams.delete("w");
    return u.toString();
  } catch {
    return url;
  }
}

function videoPreviewUrl(url: string) {
  if (!url) return url;
  const [base] = url.split("#");
  return `${base}#t=0.1`;
}

function mediaProxyUrl(url: string) {
  if (!url) return url;
  return `/api/media/stream?url=${encodeURIComponent(url)}`;
}

export default function HistoryPage() {
  const [items, setItems] = useState<Entry[]>([]);
  const [selected, setSelected] = useState<DisplayItem | null>(null);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "images" | "videos">("all");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");

  const [lang, setLangState] = useState<Lang>(() => getLang());
  const dict = t(lang);

  const [deletingUid, setDeletingUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingLocal, setPendingLocal] = useState<PendingGeneration[]>([]);
  const [nowTs, setNowTs] = useState<number>(Date.now());
  const [copiedPromptUid, setCopiedPromptUid] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // ✅ Показуємо по 20 (кнопка “Ще”)
  const [visibleCount, setVisibleCount] = useState(20);

  const mountedRef = useRef(true);
  const lockedScrollYRef = useRef(0);
  const toastTimerRef = useRef<number | null>(null);

  async function loadHistory() {
    try {
      setError(null);
      const res = await fetch("/api/history", { cache: "no-store" });
      const data = await readJsonOrRaw(res);

      if (!mountedRef.current) return;
      if (!res.ok) throw new Error(data?.error || "failed to fetch history");

      const arr = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
      if (Array.isArray(arr)) setItems(arr);
      else setItems([]);
    } catch (e: any) {
      if (!mountedRef.current) return;
      setError(e?.message || "Load error");
      setItems([]);
    }
  }

  useEffect(() => {
    mountedRef.current = true;

    loadHistory();
    const onFocus = () => loadHistory();

    window.addEventListener("focus", onFocus);
    return () => {
      mountedRef.current = false;
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  useEffect(() => {
    const refreshPending = () => setPendingLocal(readPendingGenerations());
    refreshPending();
    window.addEventListener("storage", refreshPending);
    window.addEventListener("vilna:pending-updated", refreshPending);
    window.addEventListener("focus", refreshPending);
    return () => {
      window.removeEventListener("storage", refreshPending);
      window.removeEventListener("vilna:pending-updated", refreshPending);
      window.removeEventListener("focus", refreshPending);
    };
  }, []);

  useEffect(() => {
    if (!pendingLocal.length) return;
    const timer = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [pendingLocal.length]);

  useEffect(() => {
    if (!selected) return;

    const { body, documentElement } = document;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyPosition = body.style.position;
    const prevBodyTop = body.style.top;
    const prevBodyWidth = body.style.width;
    const prevHtmlOverflow = documentElement.style.overflow;

    lockedScrollYRef.current = window.scrollY;

    documentElement.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${lockedScrollYRef.current}px`;
    body.style.width = "100%";

    return () => {
      documentElement.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      body.style.position = prevBodyPosition;
      body.style.top = prevBodyTop;
      body.style.width = prevBodyWidth;
      window.scrollTo(0, lockedScrollYRef.current);
    };
  }, [selected]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  // ✅ Скидаємо “показати ще”, коли змінився пошук/фільтр/сорт
  useEffect(() => {
    setVisibleCount(20);
  }, [search, filter, sort]);

  // 🔁 авто-оновлення, якщо є записи “в процесі” (urls порожній)
  useEffect(() => {
    let alive = true;
    let timer: any = null;

    const hasPending = items.some((it) => !(it.urls?.length > 0));
    if (!hasPending) return;

    let delayMs = 8000;
    const maxDelayMs = 15000;

    async function tick() {
      if (!alive) return;

      try {
        await loadHistory();
        delayMs = 8000;
      } catch {
        delayMs = Math.min(delayMs + 2000, maxDelayMs);
      }

      if (!alive) return;
      timer = setTimeout(tick, delayMs);
    }

    timer = setTimeout(tick, 2000);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [items]);

  // update lang when storage changes
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === "lang") {
        const v = e.newValue as Lang | null;
        if (v === "en" || v === "uk") setLangState(v);
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // ✅ Головне: розгортання “групи” (urls[]) в окремі елементи (1 url = 1 плитка)
  const expandedAll = useMemo<DisplayItem[]>(() => {
    const out: DisplayItem[] = [];
    const existingEntryIds = new Set<string>();
    const serverPendingSignatures = new Set<string>();
    for (const entry of items) {
      existingEntryIds.add(entry.id);
      const urls = Array.isArray(entry.urls) ? entry.urls : [];
      const pendingKind = inferPendingKind(entry.kind);
      const prompt = String(entry.prompt || "").trim();
      urls.forEach((url, idx) => {
        out.push({
          uid: `${entry.id}__${idx}`,
          entryId: entry.id,
          createdAt: entry.createdAt,
          prompt,
          status: entry.status,
          url,
          urlIndex: idx,
          r2Key: Array.isArray(entry.r2Keys) ? entry.r2Keys[idx] : undefined,
        });
      });

      // якщо ще в процесі (urls пусті) — покажемо 1 “порожню” плитку
      if (!urls.length) {
        serverPendingSignatures.add(
          `${pendingKind}|${prompt.toLowerCase()}|${Math.floor(Number(entry.createdAt || 0) / 10000)}`
        );
        out.push({
          uid: `${entry.id}__pending`,
          entryId: entry.id,
          createdAt: entry.createdAt,
          prompt,
          url: "",
          urlIndex: 0,
          r2Key: undefined,
          status: entry.status,
          pendingKind,
        });
      }
    }

    for (const pending of pendingLocal) {
      if (!pending?.id || existingEntryIds.has(pending.id)) continue;
      const prompt = String(pending.prompt || "").trim();
      const signature = `${pending.kind}|${prompt.toLowerCase()}|${Math.floor(Number(pending.createdAt || 0) / 10000)}`;
      if (serverPendingSignatures.has(signature)) continue;
      out.push({
        uid: `${pending.id}__pending_local`,
        entryId: pending.id,
        createdAt: Number(pending.createdAt) || Date.now(),
        prompt,
        url: "",
        urlIndex: 0,
        r2Key: undefined,
        status: "PENDING_LOCAL",
        pendingKind: pending.kind,
      });
    }
    return out;
  }, [items, pendingLocal]);

  useEffect(() => {
    const now = Date.now();
    const toDelete = items
      .filter((entry) => {
        const hasUrls = Array.isArray(entry.urls) && entry.urls.length > 0;
        if (hasUrls) return false;
        const st = String(entry.status || "").toUpperCase();
        if (st === "FAILED" || st === "ERROR") return true;
        return now - Number(entry.createdAt || 0) > STALE_PENDING_MS;
      })
      .map((entry) => String(entry.id))
      .filter(Boolean);

    if (!toDelete.length) return;

    let cancelled = false;
    (async () => {
      for (const id of toDelete) {
        if (cancelled) return;
        await fetch(`/api/history?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
      }
      if (!cancelled) loadHistory();
    })();

    return () => {
      cancelled = true;
    };
  }, [items]);

  // ✅ фільтри/пошук/сортування вже над “розгорнутими” елементами
  const filteredAll = useMemo(() => {
    const s = search.trim().toLowerCase();
    let arr = expandedAll.slice();

    if (s) {
      arr = arr.filter((it) => String(it.prompt ?? "").toLowerCase().includes(s));
    }

    if (filter !== "all") {
      arr = arr.filter((it) => {
        const isVid = it.url ? isVideoUrl(it.url) : false;
        return filter === "videos" ? isVid : !isVid;
      });
    }

    arr.sort((a, b) => (sort === "newest" ? b.createdAt - a.createdAt : a.createdAt - b.createdAt));
    return arr;
  }, [expandedAll, search, filter, sort]);

  const visibleItems = useMemo(() => filteredAll.slice(0, visibleCount), [filteredAll, visibleCount]);
  const hasMore = filteredAll.length > visibleItems.length;

  function openModal(it: DisplayItem) {
    if (!it.url) return;
    setSelected(it);
  }

  function closeModal() {
    setSelected(null);
  }

  function showToast(message: string) {
    setToastMessage(message);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, 2200);
  }

  async function copyLink(url?: string) {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      showToast(dict.copied ?? "Скопійовано!");
    } catch {
      showToast(dict.copyFailed ?? "Не вдалося скопіювати");
    }
  }

  async function copyPrompt(prompt?: string, uid?: string) {
    const value = String(prompt || "").trim();
    if (!value) {
      showToast(dict.noPrompt ?? "Немає промпту");
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      if (uid) {
        setCopiedPromptUid(uid);
        window.setTimeout(() => {
          setCopiedPromptUid((current) => (current === uid ? null : current));
        }, 1500);
      }
      showToast(dict.copied ?? "Скопійовано!");
    } catch {
      showToast(dict.copyFailed ?? "Не вдалося скопіювати");
    }
  }

  async function shareLink(url?: string) {
    if (!url) return;

    const navAny = navigator as any;
    if (navAny?.share) {
      try {
        await navAny.share({ url });
        return;
      } catch {
        // fallback
      }
    }
    await copyLink(url);
  }

  async function downloadFile(url?: string) {
    if (!url) return;

    try {
      const res = await fetch(url, { mode: "cors" });
      if (!res.ok) throw new Error("Download failed");

      const blob = await res.blob();
      const isVid = /\.(mp4|webm|mov|mkv)(\?|$)/i.test(url);
      const ext = isVid ? "mp4" : "png";
      const name = `vilna-${Date.now()}.${ext}`;

      const file = new File([blob], name, {
        type: blob.type || (isVid ? "video/mp4" : "image/png"),
      });

      const a = document.createElement("a");
      const objectUrl = URL.createObjectURL(file);
      a.href = objectUrl;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(url, "_blank");
    }
  }

  // ✅ Видалити 1 конкретний файл (а не всю “пʼятірку”)
  async function deleteOne(it: DisplayItem) {
    const ok = confirm(dict.deleteConfirm ?? "Видалити цей файл?");
    if (!ok) return;

    setError(null);
    setDeletingUid(it.uid);

    try {
      // 1) видаляємо файл з R2 (якщо є ключ)
      if (it.r2Key) {
        const r = await fetch("/api/r2/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: it.r2Key }),
        });
        const d = await readJsonOrRaw(r);
        if (!r.ok) throw new Error(d?.error || `R2 delete failed (${r.status})`);
      }

      // 2) оновлюємо локально items: прибираємо цей url з entry.urls
      setItems((prev) => {
        return prev
          .map((entry) => {
            if (entry.id !== it.entryId) return entry;

            const newUrls = (entry.urls || []).slice();
            newUrls.splice(it.urlIndex, 1);

            const newKeys = Array.isArray(entry.r2Keys) ? entry.r2Keys.slice() : undefined;
            if (newKeys) newKeys.splice(it.urlIndex, 1);

            return { ...entry, urls: newUrls, r2Keys: newKeys };
          })
          // якщо в записі не лишилось файлів — видаляємо запис історії повністю
          .filter((entry) => entry.id !== it.entryId || (entry.urls && entry.urls.length > 0));
      });

      // 3) якщо це був останній файл у записі — просимо бекенд видалити сам запис history
      const original = items.find((x) => x.id === it.entryId);
      const wasLast = (original?.urls?.length ?? 0) <= 1;
      if (wasLast) {
        const res = await fetch(`/api/history?id=${encodeURIComponent(it.entryId)}`, { method: "DELETE" });
        const data = await readJsonOrRaw(res);
        if (!res.ok) throw new Error(data?.error || `History delete failed (${res.status})`);
      }

      if (selected?.uid === it.uid) setSelected(null);
    } catch (e: any) {
      setError(e?.message || "Delete error");
    } finally {
      setDeletingUid(null);
    }
  }

  const modalUrl = selected?.url ? withoutW(selected.url) : "";
  const modalIsVideo = modalUrl ? isVideoUrl(modalUrl) : false;
  const modalVideoUrl = modalIsVideo ? mediaProxyUrl(modalUrl) : "";

  // ✅ URL превʼю: просимо маленьке через ?w=600
  function thumbUrl(url: string) {
    // 600 px — норм для плитки
    return withParam(url, "w", "600");
  }

  return (
    <div className="page-wrap">
      {/* ✅ стилі для нової сітки превʼю */}
      <style jsx global>{`
        .history-grid {
          display: grid;
          gap: 14px;
          margin-top: 14px;
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
        @media (max-width: 720px) {
          .history-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        .preview-tile {
          position: relative;
          width: 100%;
          aspect-ratio: 1 / 1;
          border-radius: 18px;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.06);
          backdrop-filter: blur(14px) saturate(140%);
          -webkit-backdrop-filter: blur(14px) saturate(140%);
          cursor: pointer;
          box-shadow: 0 18px 45px rgba(0, 0, 0, 0.35);
          content-visibility: auto;
          contain-intrinsic-size: 360px 640px;
        }

        .preview-glass {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.18);
        }

        .preview-img {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: contain;
          object-position: center;
          background: rgba(10, 12, 20, 0.65);
        }

        .preview-img--photo {
          object-fit: cover;
        }

        .preview-action {
          position: absolute;
          top: 12px;
          right: 12px;
          z-index: 2;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(10, 12, 20, 0.72);
          color: white;
          border-radius: 999px;
          padding: 8px 12px;
          font-size: 12px;
          font-weight: 600;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          cursor: pointer;
          transition: background 0.16s ease, transform 0.16s ease;
        }

        .preview-action:hover {
          background: rgba(20, 24, 38, 0.9);
          transform: translateY(-1px);
        }

        .history-toast {
          position: fixed;
          top: 24px;
          right: 24px;
          z-index: 10020;
          min-width: 220px;
          max-width: min(360px, calc(100vw - 32px));
          padding: 14px 16px;
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background:
            radial-gradient(circle at top left, rgba(255, 220, 190, 0.12), transparent 42%),
            linear-gradient(180deg, rgba(23, 20, 24, 0.9), rgba(11, 10, 14, 0.96));
          box-shadow: 0 22px 48px rgba(0, 0, 0, 0.38);
          color: rgba(255, 245, 236, 0.96);
          backdrop-filter: blur(16px) saturate(140%);
          -webkit-backdrop-filter: blur(16px) saturate(140%);
          font-size: 14px;
          line-height: 1.35;
          animation: historyToastIn 0.18s ease-out;
          pointer-events: none;
        }

        @keyframes historyToastIn {
          from {
            opacity: 0;
            transform: translateY(-8px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @media (max-width: 640px) {
          .history-toast {
            top: auto;
            right: 16px;
            left: 16px;
            bottom: calc(20px + env(safe-area-inset-bottom, 0px));
            max-width: none;
          }
        }

      `}</style>

      {/* top bar */}
      <div className="topbar">
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            className="ios-btn ios-btn--ghost"
            style={{ textDecoration: "none" }}
            onClick={() => window.location.assign("/")}
          >
            ← {dict.home}
          </button>

          <div style={{ fontSize: 26, fontWeight: 800 }}>{dict.historyTitle}</div>
        </div>

        <div className="topbar-right">
          <button
            type="button"
            className={`ios-btn ${lang === "uk" ? "ios-btn--primary" : "ios-btn--ghost"}`}
            onClick={() => {
              setLang("uk");
              setLangState("uk");
            }}
          >
            UA
          </button>
          <button
            type="button"
            className={`ios-btn ${lang === "en" ? "ios-btn--primary" : "ios-btn--ghost"}`}
            onClick={() => {
              setLang("en");
              setLangState("en");
            }}
          >
            EN
          </button>
        </div>
      </div>

      {/* filters card */}
      <div className="glass-card">
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            className="ios-input"
            placeholder={dict.searchPrompt}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 340 }}
          />

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className={`ios-btn ${filter === "all" ? "ios-btn--primary" : "ios-btn--ghost"}`}
              onClick={() => setFilter("all")}
            >
              {dict.filterAll}
            </button>
            <button
              type="button"
              className={`ios-btn ${filter === "images" ? "ios-btn--primary" : "ios-btn--ghost"}`}
              onClick={() => setFilter("images")}
            >
              {dict.filterImages}
            </button>
            <button
              type="button"
              className={`ios-btn ${filter === "videos" ? "ios-btn--primary" : "ios-btn--ghost"}`}
              onClick={() => setFilter("videos")}
            >
              {dict.filterVideos}
            </button>
          </div>

          <select className="ios-select" value={sort} onChange={(e) => setSort(e.target.value as any)} style={{ width: 180 }}>
            <option value="newest">{dict.sortNewest}</option>
            <option value="oldest">{dict.sortOldest}</option>
          </select>

          <button type="button" className="ios-btn ios-btn--ghost" onClick={loadHistory}>
            {dict.refresh ?? "Оновити"}
          </button>
        </div>

        {error && (
          <div style={{ marginTop: 10, color: "rgba(255,120,120,0.95)", whiteSpace: "pre-wrap" }}>
            {error}
          </div>
        )}
      </div>

      {/* grid: only preview tiles */}
      {visibleItems.length === 0 ? (
        <div className="helper" style={{ textAlign: "center", marginTop: 30 }}>
          {dict.emptyMessage}
        </div>
      ) : (
        <>
          <div className="history-grid">
            {visibleItems.map((it) => {
              const url = it.url;
              const isVid = url ? isVideoUrl(url) : false;
              const busy = deletingUid === it.uid;

              // статус: якщо url пустий — “processing”
              const badge = url ? (dict.done ?? "Готово") : (dict.processing ?? "Генерується");
              const elapsedSec = Math.max(0, Math.floor((nowTs - Number(it.createdAt || 0)) / 1000));
              const elapsedMin = Math.floor(elapsedSec / 60);
              const elapsedRem = String(elapsedSec % 60).padStart(2, "0");
              const elapsedText = `${String(elapsedMin).padStart(2, "0")}:${elapsedRem}`;
              const waitHint = !url && it.pendingKind === "video"
                ? lang === "uk"
                  ? "Відео може генеруватися до 10-15 хвилин"
                  : "Video generation may take up to 10-15 minutes"
                : null;

              return (
                <div
                  key={it.uid}
                  className="preview-tile"
                  style={{
                    opacity: busy ? 0.6 : 1,
                    pointerEvents: busy ? "none" : "auto",
                    cursor: url ? "pointer" : "default",
                    aspectRatio: "9 / 16",
                  }}
                  onClick={() => openModal(it)}
                  title={it.prompt ?? ""}
                >
                  <button
                    type="button"
                    className="preview-action"
                    onClick={(e) => {
                      e.stopPropagation();
                      void copyPrompt(it.prompt, it.uid);
                    }}
                  >
                    {copiedPromptUid === it.uid
                      ? (dict.copied ?? "Скопійовано!")
                      : (dict.copyPrompt ?? "Скопіювати промпт")}
                  </button>

                  {url ? (
                    isVid ? (
                      <>
                        <video
                          className="preview-img"
                          src={videoPreviewUrl(url)}
                          muted
                          playsInline
                          preload="metadata"
                          controls={false}
                          disablePictureInPicture
                        />
                        <div className="preview-glass" />
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
                              fontSize: 64,
                              color: "rgba(255, 255, 255, 0.95)",
                              lineHeight: 1,
                              textShadow: "0 2px 12px rgba(0, 0, 0, 0.6)",
                            }}
                          >
                            ▶
                          </div>
                        </div>
                        <div
                          style={{
                            position: "absolute",
                            bottom: 12,
                            left: 12,
                            background: "rgba(0, 0, 0, 0.8)",
                            color: "white",
                            fontSize: 12,
                            padding: "6px 10px",
                            borderRadius: 8,
                            fontWeight: 600,
                            pointerEvents: "none",
                          }}
                        >
                          Video
                        </div>
                      </>
                    ) : (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          className="preview-img preview-img--photo"
                          src={thumbUrl(url)}
                          alt={it.prompt || dict.noPreview}
                          loading="lazy"
                        />
                      </>
                    )
                  ) : (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "grid",
                        placeItems: "center",
                        gap: 8,
                        color: "rgba(255,255,255,0.65)",
                        fontSize: 13,
                        textAlign: "center",
                      }}
                    >
                      <div style={{ fontWeight: 650 }}>{badge}</div>
                      <div style={{ fontSize: 12, opacity: 0.85 }}>{elapsedText}</div>
                      {waitHint && (
                        <div style={{ fontSize: 11, opacity: 0.75, maxWidth: 220 }}>{waitHint}</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {hasMore && (
            <div style={{ textAlign: "center", margin: "24px 0" }}>
              <button type="button" className="ios-btn ios-btn--ghost" onClick={() => setVisibleCount((v) => v + 20)}>
                {dict.loadMore ?? "Завантажити ще"}
              </button>
            </div>
          )}
        </>
      )}

      {/* modal */}
      {selected && modalUrl && (
        <div
          onClick={closeModal}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 18,
            overflowY: "auto",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(1100px, 100%)",
              borderRadius: 24,
              overflow: "hidden",
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.08)",
              backdropFilter: "blur(18px) saturate(140%)",
              WebkitBackdropFilter: "blur(18px) saturate(140%)",
              boxShadow: "0 22px 60px rgba(0,0,0,0.45)",
              position: "relative",
              maxHeight: "calc(100dvh - 36px)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 14,
                left: 14,
                right: 14,
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                zIndex: 2,
              }}
            >
              <div />
              <button type="button" className="ios-btn ios-btn--ghost" onClick={closeModal}>
                ✕
              </button>
            </div>

            <div
              style={{
                padding: 18,
                paddingTop: 64,
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
              }}
            >
              <div style={{ width: "min(100%, 720px)", display: "grid", gap: 16, margin: "0 auto" }}>
                {modalIsVideo ? (
                  <div
                    style={{
                      width: "min(100%, 460px)",
                      maxHeight: "min(62dvh, 720px)",
                      margin: "0 auto",
                      borderRadius: 18,
                      overflow: "hidden",
                      background: "rgba(8, 10, 18, 0.96)",
                      boxShadow: "0 18px 50px rgba(0,0,0,0.35)",
                    }}
                  >
                    <video
                      src={modalVideoUrl}
                      controls
                      playsInline
                      preload="metadata"
                      style={{
                        display: "block",
                        width: "100%",
                        maxHeight: "min(62dvh, 720px)",
                        objectFit: "contain",
                        background: "rgba(8, 10, 18, 0.96)",
                      }}
                    />
                  </div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={modalUrl}
                    alt={selected.prompt || "preview"}
                    style={{
                      display: "block",
                      width: "auto",
                      maxWidth: "100%",
                      height: "auto",
                      maxHeight: "min(62dvh, 720px)",
                      objectFit: "contain",
                      borderRadius: 18,
                      margin: "0 auto",
                    }}
                  />
                )}

                <div
                  style={{
                    display: "grid",
                    gap: 8,
                    padding: 14,
                    borderRadius: 18,
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "rgba(255,255,255,0.05)",
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.82 }}>
                    {dict.copyPrompt ?? "Скопіювати промпт"}
                  </div>
                  <div
                    style={{
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      fontSize: 14,
                      lineHeight: 1.5,
                      color: "rgba(255,255,255,0.92)",
                      opacity: selected.prompt ? 1 : 0.68,
                    }}
                  >
                    {selected.prompt || (dict.noPrompt ?? "Немає промпту")}
                  </div>
                </div>
              </div>
            </div>

            {/* ✅ кнопки тільки в модалці */}
            <div
              style={{
                padding: 16,
                paddingBottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
                flexWrap: "wrap",
                background: "rgba(24, 24, 28, 0.72)",
                borderTop: "1px solid rgba(255,255,255,0.08)",
                flexShrink: 0,
              }}
            >
              <button type="button" className="ios-btn ios-btn--ghost" onClick={() => downloadFile(modalUrl)}>
                {dict.download ?? "Скачати"}
              </button>
              <button type="button" className="ios-btn ios-btn--ghost" onClick={() => copyLink(modalUrl)}>
                {dict.copyLink}
              </button>
              <button
                type="button"
                className="ios-btn ios-btn--ghost"
                onClick={() => copyPrompt(selected.prompt, selected.uid)}
              >
                {dict.copyPrompt ?? "Скопіювати промпт"}
              </button>
              <button type="button" className="ios-btn ios-btn--ghost" onClick={() => shareLink(modalUrl)}>
                {dict.share}
              </button>
              <button
                type="button"
                className="ios-btn ios-btn--danger"
                onClick={() => deleteOne(selected)}
                disabled={deletingUid === selected.uid}
              >
                {deletingUid === selected.uid ? (dict.deleting ?? "Видаляю...") : dict.delete}
              </button>
            </div>
          </div>
        </div>
      )}

      {toastMessage && <div className="history-toast">{toastMessage}</div>}
    </div>
  );
}
