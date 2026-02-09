"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { getLang, setLang, t, type Lang } from "../i18n";
import { useRouter } from "next/navigation";

type Entry = {
  id: string;
  createdAt: number;
  urls: string[];
  prompt?: string;
  r2Keys?: string[]; // ✅ ДОДАЛИ (для видалення з R2)
};

async function readJsonOrRaw(res: Response) {
  const rawText = await res.text();
  try {
    return JSON.parse(rawText);
  } catch {
    return { raw: rawText };
  }
}

export default function HistoryPage() {
  const router = useRouter();
  const [items, setItems] = useState<Entry[]>([]);
  const [selected, setSelected] = useState<{ id: string; urlIndex: number } | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "images" | "videos">("all");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [lang, setLangState] = useState<Lang>(() => getLang());
  const dict = t(lang);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ✅ НОВЕ: показуємо по 20 елементів
  const [visibleCount, setVisibleCount] = useState(20);

  const mountedRef = useRef(true);

  async function loadHistory() {
    try {
      setError(null);
      const res = await fetch("/api/history", { cache: "no-store" });
      const data = await readJsonOrRaw(res);

      if (!mountedRef.current) return;

      if (!res.ok) throw new Error(data?.error || "failed to fetch history");

      // Підтримка двох форматів: або масив, або {items: [...]}
      const arr = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
      if (Array.isArray(arr)) setItems(arr);
      else setItems([]);
    } catch (e: any) {
      if (!mountedRef.current) return;
      setError(e?.message || "Load error");
      setItems([]);
    }
  }

  // initial load + focus reload
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

  // ✅ НОВЕ: при зміні пошуку/фільтра/сорту — повертаємось до перших 20
  useEffect(() => {
    setVisibleCount(20);
  }, [search, filter, sort]);

  // 🔁 auto-poll while there are "processing" entries (urls empty)
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

  // modal keyboard navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSelected(null);
      if (!selected) return;

      const item = items.find((x) => x.id === selected.id);
      if (!item) return;

      if (e.key === "ArrowRight") {
        setSelected({ id: selected.id, urlIndex: Math.min(selected.urlIndex + 1, item.urls.length - 1) });
      }
      if (e.key === "ArrowLeft") {
        setSelected({ id: selected.id, urlIndex: Math.max(selected.urlIndex - 1, 0) });
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, items]);

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

  function isVideoUrl(url: string) {
    return !!url.match(/\.(mp4|webm|mov|mkv)(\?|$)/i);
  }

  function previewType(url: string) {
    return isVideoUrl(url) ? dict.video : dict.image;
  }

  // ✅ Спочатку рахуємо повний відфільтрований список
  const filteredAll = useMemo(() => {
    const s = search.trim().toLowerCase();
    let arr = items.slice();

    if (s) arr = arr.filter((it) => String(it.prompt ?? "").toLowerCase().includes(s));

    if (filter !== "all") {
      arr = arr.filter((it) => {
        const first = it.urls?.[0] ?? "";
        const isVideo = isVideoUrl(first);
        return filter === "videos" ? isVideo : !isVideo;
      });
    }

    arr.sort((a, b) => (sort === "newest" ? b.createdAt - a.createdAt : a.createdAt - b.createdAt));
    return arr;
  }, [items, search, filter, sort]);

  // ✅ А тут показуємо тільки перші visibleCount
  const visibleItems = useMemo(() => {
    return filteredAll.slice(0, visibleCount);
  }, [filteredAll, visibleCount]);

  function openModal(item: Entry) {
    if (!item?.urls?.length) return;
    setSelected({ id: item.id, urlIndex: 0 });
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
        // fallback to copy
      }
    }

    await copyLink(url);
  }

  // ✅ НОВЕ: справжнє видалення (R2 + history)
  async function deleteItem(entry: Entry) {
    const ok = confirm(dict.deleteConfirm ?? "Видалити цей запис і файли з R2?");
    if (!ok) return;

    setError(null);
    setDeletingId(entry.id);

    try {
      // 1) видаляємо файли з R2
      if (Array.isArray(entry.r2Keys) && entry.r2Keys.length) {
        for (const key of entry.r2Keys) {
          const r = await fetch("/api/r2/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ key }),
          });
          const d = await readJsonOrRaw(r);
          if (!r.ok) throw new Error(d?.error || `R2 delete failed (${r.status})`);
        }
      }

      // 2) видаляємо запис з history
      // ⚠️ Потрібно щоб /api/history підтримував DELETE
      const res = await fetch(`/api/history?id=${encodeURIComponent(entry.id)}`, { method: "DELETE" });
      const data = await readJsonOrRaw(res);
      if (!res.ok) throw new Error(data?.error || `History delete failed (${res.status})`);

      // 3) прибираємо зі списку
      setItems((prev) => prev.filter((x) => x.id !== entry.id));
      if (selected?.id === entry.id) setSelected(null);
    } catch (e: any) {
      setError(e?.message || "Delete error");
    } finally {
      setDeletingId(null);
    }
  }

  const modalItem = selected ? items.find((x) => x.id === selected.id) : null;
  const modalUrl = modalItem ? modalItem.urls[selected!.urlIndex] : "";
  const modalIsVideo = modalUrl ? isVideoUrl(modalUrl) : false;

  const hasMore = filteredAll.length > visibleItems.length;

  return (
    <div className="page-wrap">
      {/* top bar */}
      <div className="topbar">
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            className="ios-btn ios-btn--ghost"
            style={{ textDecoration: "none" }}
            onClick={() => {
              // ✅ 100% працює завжди (повний перехід + оновлення)
              window.location.assign("/");
            }}
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
          <div style={{ marginTop: 10, color: "rgba(255,120,120,0.95)", whiteSpace: "pre-wrap" }}>{error}</div>
        )}
      </div>

      {/* grid */}
      {visibleItems.length === 0 ? (
        <div className="helper" style={{ textAlign: "center", marginTop: 30 }}>
          {dict.emptyMessage}
        </div>
      ) : (
        <>
          <div className="grid" style={{ marginTop: 14 }}>
            {visibleItems.map((it) => {
              const first = it.urls?.[0] ?? "";
              const type = first ? previewType(first) : dict.image;
              const badge = it.urls?.length ? dict.done : dict.processing;

              const busy = deletingId === it.id;

              return (
                <div
                  key={it.id}
                  className="thumb"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    opacity: busy ? 0.6 : 1,
                    pointerEvents: busy ? "none" : "auto",
                  }}
                >
                  <div
                    style={{
                      position: "relative",
                      paddingTop: "56.25%",
                      cursor: first ? "pointer" : "default",
                      background: "rgba(255,255,255,0.04)",
                    }}
                    onClick={() => openModal(it)}
                  >
                    {first ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={first}
                        alt={it.prompt || dict.noPreview}
                        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "rgba(255,255,255,0.55)",
                          fontSize: 13,
                        }}
                      >
                        {dict.noPreview}
                      </div>
                    )}
                  </div>

                  <div style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <div style={{ fontSize: 13, opacity: 0.92 }}>{type}</div>
                    <div
                      style={{
                        fontSize: 12,
                        padding: "5px 10px",
                        borderRadius: 999,
                        background: badge === dict.done ? "rgba(52,199,89,0.22)" : "rgba(255,159,10,0.22)",
                        border: "1px solid rgba(255,255,255,0.10)",
                        color: "rgba(255,255,255,0.92)",
                      }}
                    >
                      {badge}
                    </div>
                  </div>

                  <div style={{ padding: "0 12px 12px", fontSize: 12, color: "rgba(255,255,255,0.72)", flex: 1 }}>
                    {it.prompt ?? ""}
                  </div>

                  <div
                    style={{
                      padding: "0 12px 14px",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>{new Date(it.createdAt).toLocaleString()}</div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="ios-btn ios-btn--ghost"
                        onClick={() => it.urls?.[0] && window.open(it.urls?.[0], "_blank")}
                        disabled={!it.urls?.[0]}
                      >
                        {dict.open}
                      </button>
                      <button
                        type="button"
                        className="ios-btn ios-btn--ghost"
                        onClick={() => copyLink(it.urls?.[0])}
                        disabled={!it.urls?.[0]}
                      >
                        {dict.copyLink}
                      </button>
                      <button
                        type="button"
                        className="ios-btn ios-btn--ghost"
                        onClick={() => shareLink(it.urls?.[0])}
                        disabled={!it.urls?.[0]}
                      >
                        {dict.share}
                      </button>
                      <button type="button" className="ios-btn ios-btn--danger" onClick={() => deleteItem(it)} disabled={busy}>
                        {busy ? (dict.deleting ?? "Видаляю...") : dict.delete}
                      </button>
                    </div>
                  </div>

                  {Array.isArray(it.r2Keys) && it.r2Keys.length ? (
                    <div style={{ padding: "0 12px 12px", fontSize: 11, opacity: 0.55 }}>R2: {it.r2Keys.length} files</div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {/* ✅ Кнопка "Завантажити ще" */}
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
      {selected && modalItem && modalUrl && (
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
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {modalItem.urls.length > 1 && (
                  <button
                    type="button"
                    className="ios-btn ios-btn--ghost"
                    onClick={() => setSelected({ id: modalItem.id, urlIndex: Math.max(selected.urlIndex - 1, 0) })}
                  >
                    ←
                  </button>
                )}
                {modalItem.urls.length > 1 && (
                  <button
                    type="button"
                    className="ios-btn ios-btn--ghost"
                    onClick={() =>
                      setSelected({ id: modalItem.id, urlIndex: Math.min(selected.urlIndex + 1, modalItem.urls.length - 1) })
                    }
                  >
                    →
                  </button>
                )}

                <div
                  style={{
                    alignSelf: "center",
                    fontSize: 12,
                    padding: "6px 10px",
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "rgba(0,0,0,0.25)",
                    color: "rgba(255,255,255,0.9)",
                  }}
                >
                  {`${selected.urlIndex + 1}/${modalItem.urls.length}`}
                </div>
              </div>

              <button type="button" className="ios-btn ios-btn--ghost" onClick={closeModal}>
                ✕
              </button>
            </div>

            <div style={{ padding: 18, paddingTop: 64, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {modalIsVideo ? (
                <video src={modalUrl} controls style={{ maxWidth: "100%", maxHeight: "78vh", borderRadius: 18 }} />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={modalUrl} alt={modalItem.prompt || "preview"} style={{ maxWidth: "100%", maxHeight: "78vh", borderRadius: 18 }} />
              )}
            </div>

            <div style={{ padding: 16, display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="ios-btn ios-btn--ghost" onClick={() => window.open(modalUrl, "_blank")}>
                {dict.open}
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
                onClick={() => deleteItem(modalItem)}
                disabled={deletingId === modalItem.id}
              >
                {deletingId === modalItem.id ? (dict.deleting ?? "Видаляю...") : dict.delete}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
