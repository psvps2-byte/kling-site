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

  // Закриваємо список при кліку поза меню (click, не mousedown)
  useEffect(() => {
    function close(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const currentLabel = lang === "uk" ? "UA" : "EN";

  const pick = (next: Lang) => {
    if (next === lang) {
      setOpen(false);
      return;
    }
    setLang(next);
    setLangState(next);
    setOpen(false);
    window.location.reload();
  };

  // Стиль “пілл” як у кнопок зверху (Історія / лічильник)
  const pillStyle = {
    padding: "10px 18px",
    minHeight: 40,
    borderRadius: 999,
    lineHeight: 1,
    fontSize: 14,
    fontWeight: 500,
  } as const;

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex" }}>
      {/* Головна кнопка (без стрілочки) */}
      <button
        type="button"
        className="ios-btn ios-btn--ghost"
        style={pillStyle}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {currentLabel}
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
            padding: 10,
            boxShadow: "0 12px 40px rgba(0, 0, 0, 0.6)",
            backdropFilter: "blur(10px) saturate(120%)",
            WebkitBackdropFilter: "blur(10px) saturate(120%)",
            minWidth: 84,
          }}
          role="menu"
        >
          {/* UA */}
          <button
            type="button"
            className={`ios-btn ${lang === "uk" ? "ios-btn--primary" : "ios-btn--ghost"}`}
            style={{ ...pillStyle, width: "100%" }}
            onClick={() => pick("uk")}
            role="menuitem"
          >
            UA
          </button>

          {/* EN */}
          <button
            type="button"
            className={`ios-btn ${lang === "en" ? "ios-btn--primary" : "ios-btn--ghost"}`}
            style={{ ...pillStyle, width: "100%" }}
            onClick={() => pick("en")}
            role="menuitem"
          >
            EN
          </button>
        </div>
      )}
    </div>
  );
}
