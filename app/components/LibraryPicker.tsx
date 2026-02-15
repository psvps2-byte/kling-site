"use client";

import { useEffect, useState } from "react";
import { getLang, t, type Lang } from "../i18n";
import LangSwitch from "./LangSwitch";

type Item = {
  id: string;
  kind: "image" | "video";
  url: string;
  createdAt?: string;
  prompt?: string;
};

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
  const dict = t(lang);

  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        const res = await fetch(`/api/history?kind=${kind}`, { signal: controller.signal, cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || "Failed to load");

        const arr = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
        setItems(Array.isArray(arr) ? arr : []);
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
        {/* Header with title, lang switch, and close button */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            {dict.history}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginLeft: "auto",
            }}
          >
            <LangSwitch />
            <button className="ios-btn ios-btn--ghost" style={{ padding: "6px 10px" }} onClick={onClose}>
              {dict.close}
            </button>
          </div>
        </div>

        {loading && <div style={{ opacity: 0.8 }}>{dict.processing}</div>}
        {error && (
          <div style={{ color: "rgba(255,120,120,0.95)", marginBottom: 8 }}>
            {error}
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div style={{ opacity: 0.8 }}>{dict.libraryEmpty}</div>
        )}

        {/* Content area with grid - ensure it doesn't overlap header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            gap: 10,
            marginTop: 8,
          }}
        >
          {items.map((it) => (
            <button
              key={`${it.id}-${it.url}`}
              type="button"
              onClick={() => onPick(it.url)}
              style={{
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.04)",
                borderRadius: 14,
                padding: 0,
                overflow: "hidden",
                cursor: "pointer",
              }}
              title={it.prompt || it.url}
            >
              {it.kind === "video" ? (
                <video
                  src={it.url}
                  muted
                  playsInline
                  preload="metadata"
                  style={{ width: "100%", height: 140, objectFit: "cover", display: "block" }}
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.url} alt="history" style={{ width: "100%", height: 140, objectFit: "cover", display: "block" }} />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
