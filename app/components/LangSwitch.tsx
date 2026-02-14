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
      <button className="ios-btn ios-btn--ghost" onClick={() => setOpen((v) => !v)}>
        {current} ▾
      </button>

      {open && (
        <div className="smallDropdown miniDropdown" style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, zIndex: 10000 }}>
          <button
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
