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
    <div ref={ref} style={{ position: "fixed", top: 12, right: 12, zIndex: 9999 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          padding: "8px 12px",
          borderRadius: 10,
          background: "rgba(0,0,0,0.5)",
          color: "white",
          border: "1px solid rgba(255,255,255,0.2)",
          cursor: "pointer",
          fontWeight: 700,
        }}
      >
        {current} ▾
      </button>

      {open && (
        <div
          style={{
            marginTop: 6,
            borderRadius: 10,
            background: "rgba(0,0,0,0.75)",
            border: "1px solid rgba(255,255,255,0.2)",
          }}
        >
          <button
            onClick={() => {
              setLang(other);
              setLangState(other);
              setOpen(false);
            }}
            style={{
              display: "block",
              width: "100%",
              padding: "8px 12px",
              background: "transparent",
              color: "white",
              border: "none",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            {otherLabel}
          </button>
        </div>
      )}
    </div>
  );
}
