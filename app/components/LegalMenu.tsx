"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getLang, setLang, type Lang } from "../i18n";

type Item = { label: { uk: string; en: string }; href: string };

export default function LegalMenu({ email = "contact.vilna.pro@gmail.com" }: { email?: string }) {
  const pathname = usePathname();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [lang, setLangState] = useState<Lang>("uk");
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setLangState(getLang());
  }, []);

  useEffect(() => {
    const mql = window.matchMedia("(max-width: 980px)");
    setIsMobile(mql.matches);

    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  const items: Item[] = useMemo(
    () => [
      { label: { uk: "Умови", en: "Terms" }, href: "/terms" },
    ],
    []
  );

  function switchLang(next: Lang) {
    setLang(next);
    setLangState(next);
  }

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      alert("Не вдалося скопіювати. Скопіюй вручну: " + email);
    }
  }

  const t = (uk: string, en: string) => (lang === "uk" ? uk : en);

  function go(href: string) {
    // Закриваємо меню, потім навігація — так стабільніше на ПК/моб
    setOpen(false);
    // маленька затримка, щоб анімація/overlay не "з'їдали" клік
    requestAnimationFrame(() => router.push(href));
  }

  return (
    <>
      {/* Кнопка меню коли закрито */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          style={{
            position: "relative",
            width: 48,
            height: 48,
            borderRadius: 14,
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.12)",
            color: "white",
            cursor: "pointer",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* нормальний "бургер" з рисками */}
          <span
            aria-hidden="true"
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: 6,
              width: 24,
            }}
          >
            <span style={{ height: 2.5, width: 24, borderRadius: 2, background: "currentColor" }} />
            <span style={{ height: 2.5, width: 24, borderRadius: 2, background: "currentColor" }} />
            <span style={{ height: 2.5, width: 24, borderRadius: 2, background: "currentColor" }} />
          </span>
        </button>
      )}

      {/* Затемнення фону коли меню відкрите */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            zIndex: 2147483647,
          }}
        />
      )}

      {/* Ліве меню */}
      <aside
        style={{
          position: "fixed",
          top: 18,
          left: 18,
          width: 320,
          // mobile-safe: не залежимо від 100vh (iOS Safari), + даємо місце знизу
          height: "calc(100dvh - 36px)",
          borderRadius: 22,
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.10)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          padding: 16,
          paddingBottom: "calc(16px + env(safe-area-inset-bottom))",
          color: "white",
          zIndex: 2147483647,
          transform: open ? "translateX(0)" : "translateX(-110%)",
          transition: "transform 180ms ease",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* top row */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            style={{
              width: 42,
              height: 42,
              borderRadius: 14,
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "white",
              cursor: "pointer",
            }}
          >
            ✕
          </button>

          {/* Перемикач мови */}
          <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
            <button
              onClick={() => switchLang("uk")}
              style={{
                padding: "8px 10px",
                borderRadius: 12,
                background: lang === "uk" ? "rgba(120,160,255,0.18)" : "rgba(255,255,255,0.06)",
                border:
                  lang === "uk" ? "1px solid rgba(120,160,255,0.35)" : "1px solid rgba(255,255,255,0.10)",
                color: "white",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              UA
            </button>
            <button
              onClick={() => switchLang("en")}
              style={{
                padding: "8px 10px",
                borderRadius: 12,
                background: lang === "en" ? "rgba(120,160,255,0.18)" : "rgba(255,255,255,0.06)",
                border:
                  lang === "en" ? "1px solid rgba(120,160,255,0.35)" : "1px solid rgba(255,255,255,0.10)",
                color: "white",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              EN
            </button>
          </div>
        </div>

        {/* scroll area */}
        <div style={{ marginTop: 18, display: "grid", gap: 8, overflowY: "auto", paddingRight: 2 }}>
          {items.map((it) => {
            const active = pathname === it.href;

            // IMPORTANT: не Link, а button + router.push для стабільної навігації
            return (
              <button
                key={it.href}
                type="button"
                onClick={() => go(it.href)}
                style={{
                  textAlign: "left",
                  padding: "12px 14px",
                  borderRadius: 14,
                  color: "white",
                  cursor: "pointer",
                  background: active ? "rgba(120,160,255,0.18)" : "rgba(255,255,255,0.04)",
                  border: active ? "1px solid rgba(120,160,255,0.35)" : "1px solid rgba(255,255,255,0.08)",
                  fontSize: isMobile ? 20 : 18,
                  fontWeight: 500,
                }}
              >
                {lang === "uk" ? it.label.uk : it.label.en}
              </button>
            );
          })}
        </div>

        <div style={{ flex: 1, minHeight: 10 }} />

        {/* Email (click to copy) */}
        <div
          onClick={copyEmail}
          style={{
            flexShrink: 0,
            paddingTop: 12,
            borderTop: "1px solid rgba(255,255,255,0.10)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            cursor: "pointer",
          }}
        >
          <div
            style={{
              opacity: 0.85,
              fontSize: 14,
              maxWidth: 220,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={email}
          >
            {email}
          </div>

          {copied && <div style={{ fontSize: 12, opacity: 0.7 }}>{t("Скопійовано", "Copied")}</div>}
        </div>
      </aside>
    </>
  );
}
