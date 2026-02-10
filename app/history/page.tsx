"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { getLang, setLang, t, type Lang } from "../i18n";
import { useRouter } from "next/navigation";

type Entry = {
  id: string;
  createdAt: number;
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
};

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

export default function HistoryPage() {
  const router = useRouter();

  const [items, setItems] = useState<Entry[]>([]);
  const [selected, setSelected] = useState<DisplayItem | null>(null);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "images" | "videos">("all");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");

  const [lang, setLangState] = useState<Lang>(() => getLang());
  const dict = t(lang);

  const [deletingUid, setDeletingUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ✅ Показуємо по 20 (кнопка “Ще”)
  const [visibleCount, setVisibleCount] = useState(20);

  const mountedRef = useRef(true);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    for (const entry of items) {
      const urls = Array.isArray(entry.urls) ? entry.urls : [];
      urls.forEach((url, idx) => {
        out.push({
          uid: `${entry.id}__${idx}`,
          entryId: entry.id,
          createdAt: entry.createdAt,
          prompt: entry.prompt,
          url,
          urlIndex: idx,
          r2Key: Array.isArray(entry.r2Keys) ? entry.r2Keys[idx] : undefined,
        });
      });

      // якщо ще в процесі (urls пусті) — покажемо 1 “порожню” плитку
      if (!urls.length) {
        out.push({
          uid: `${entry.id}__pending`,
          entryId: entry.id,
          createdAt: entry.createdAt,
          prompt: entry.prompt,
          url: "",
          urlIndex: 0,
          r2Key: undefined,
        });
      }
    }
    return out;
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

  async function copyLink(url?: string) {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      alert(dict.copied);
    } catch {
      alert(dict.copyFailed);
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

  function downloadFile(url?: string) {
    if (!url) return;
    // найпростіше: відкриваємо у новій вкладці, далі "Save as…"
    window.open(url, "_blank");
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
          aspect-ratio: 1 / 1; /* ✅ квадрат */
          border-radius: 18px;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.06);
          backdrop-filter: blur(14px) saturate(140%);
          -webkit-backdrop-filter: blur(14px) saturate(140%);
          cursor: pointer;
          box-shadow: 0 18px 45px rgba(0, 0, 0, 0.35);
        }

        .preview-bg {
          position: absolute;
          inset: 0;
          transform: scale(1.08);
          filter: blur(18px);
          opacity: 0.45;
          background-size: cover;
          background-position: center;
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
          object-fit: contain; /* ✅ повністю вміщається */
          object-position: center;
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

              return (
                <div
                  key={it.uid}
                  className="preview-tile"
                  style={{
                    opacity: busy ? 0.6 : 1,
                    pointerEvents: busy ? "none" : "auto",
                    cursor: url ? "pointer" : "default",
                  }}
                  onClick={() => openModal(it)}
                  title={it.prompt ?? ""}
                >

                  {url ? (
                    <>
                      <div
                        className="preview-bg"
                        style={{
                          backgroundImage: `url("${thumbUrl(url)}")`,
                        }}
                      />
                      <div className="preview-glass" />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img className="preview-img" src={thumbUrl(url)} alt={it.prompt || dict.noPreview} />
                    </>
                  ) : (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "rgba(255,255,255,0.65)",
                        fontSize: 13,
                      }}
                    >
                      {badge}
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

            <div style={{ padding: 18, paddingTop: 64, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {modalIsVideo ? (
                <video src={modalUrl} controls style={{ maxWidth: "100%", maxHeight: "78vh", borderRadius: 18 }} />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={modalUrl}
                  alt={selected.prompt || "preview"}
                  style={{ maxWidth: "100%", maxHeight: "78vh", borderRadius: 18 }}
                />
              )}
            </div>

            {/* ✅ кнопки тільки в модалці */}
            <div style={{ padding: 16, display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="ios-btn ios-btn--ghost" onClick={() => downloadFile(modalUrl)}>
                {dict.download ?? "Скачати"}
              </button>
              <button type="button" className="ios-btn ios-btn--ghost" onClick={() => copyLink(modalUrl)}>
                {dict.copyLink}
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
    </div>
  );
}
