"use client";

import { useEffect, useRef, useState } from "react";
import { getLang, setLang, type Lang } from "../i18n";

export default function LangSwitch() {
  const [open, setOpen] = useState(false);
  const [lang, setLangState] = useState<Lang>("uk");
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setLangState(getLang());
  }, []);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const current = lang === "uk" ? "UA" : "EN";
  const other: Lang = lang === "uk" ? "en" : "uk";
  const otherLabel = other === "uk" ? "UA" : "EN";

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex" }}>
      <button className="ios-btn ios-btn--primary" style={{ padding: "8px 16px" }} onClick={() => setOpen((v) => !v)}>
        {current} ▾
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            zIndex: 10000,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            background: "rgba(6, 8, 12, 0.82)",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            borderRadius: 14,
            padding: 8,
            boxShadow: "0 12px 40px rgba(0, 0, 0, 0.6)",
            backdropFilter: "blur(10px) saturate(120%)",
            WebkitBackdropFilter: "blur(10px) saturate(120%)",
          }}
        >
          <button
            className="ios-btn ios-btn--ghost"
            style={{ padding: "8px 16px", width: "100%" }}
            onClick={() => {
              setLang(other);
              setLangState(other);
              window.location.reload();
              setOpen(false);
            }}
          >
            {otherLabel}
          </button>
        </div>
      )}
    </div>
  );
}
