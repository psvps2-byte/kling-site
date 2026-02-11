"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState, useEffect, type ReactNode } from "react";

import { getLang, setLang, type Lang } from "../i18n";

type Item = {
  label: { uk: string; en: string };
  href: string;
};

export default function LegalShell({
  title,
  children,
  email = "contact.vilna.pro@gmail.com",
}: {
  title: { uk: string; en: string };
  children: { uk: ReactNode; en: ReactNode };
  email?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [langState, setLangState] = useState<Lang>("uk");

  useEffect(() => {
    setMounted(true);
    setLangState(getLang());
  }, []);

  const isMobile = mounted ? window.matchMedia("(max-width: 980px)").matches : false;

  const items: Item[] = useMemo(
    () => [
      { label: { uk: "Умови", en: "Terms" }, href: "/terms" },
    ],
    []
  );

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(email);
      alert(langState === "uk" ? "Email скопійовано" : "Email copied");
    } catch {
      alert(
        (langState === "uk"
          ? "Не вдалося скопіювати. Скопіюй вручну: "
          : "Copy failed. Copy manually: ") + email
      );
    }
  }

  function switchLang(next: Lang) {
    setLang(next);
    setLangState(next);
  }

  const t = (uk: string, en: string) => (langState === "uk" ? uk : en);

  function goHome() {
    setOpen(false);
    router.push("/");
  }

  // Розміри/відступи кнопок
  const topOffset = mounted && isMobile ? 28 : 18;
  const btnSize = mounted && isMobile ? 46 : 52;

  return (
    <div style={{ minHeight: "100vh", padding: 24, position: "relative", isolation: "isolate" }}>
      {/* ✅ Верхні кнопки тепер і на мобільному, і на ПК (але тільки коли меню ЗАКРИТЕ) */}
      {mounted && !open && (
        <>
          <button
            onClick={goHome}
            aria-label="Go home"
            style={{
              position: "fixed",
              top: topOffset,
              left: 18,
              width: btnSize,
              height: btnSize,
              borderRadius: 14,
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "white",
              cursor: "pointer",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              zIndex: 80,
              fontSize: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            title={t("На головну", "Home")}
          >
            ←
          </button>

          <button
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            style={{
              position: "fixed",
              top: topOffset,
              left: 18 + btnSize + 10,
              width: btnSize,
              height: btnSize,
              borderRadius: 14,
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "white",
              cursor: "pointer",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              zIndex: 80,
              fontSize: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            title={t("Меню", "Menu")}
          >
            ☰
          </button>
        </>
      )}

      {/* Затемнення фону коли меню відкрите */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            zIndex: 40,
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
          height: "calc(100vh - 36px)",
          borderRadius: 22,
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.10)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          padding: 16,
          color: "white",
          zIndex: 60,
          overflowY: "auto",
          transform: open ? "translateX(0)" : "translateX(-110%)",
          transition: "transform 180ms ease",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={goHome}
            aria-label="Go home"
            style={{
              width: 42,
              height: 42,
              borderRadius: 14,
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "white",
              cursor: "pointer",
            }}
            title={t("На головну", "Home")}
          >
            ✕
          </button>

          <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
            <button
              onClick={() => switchLang("uk")}
              style={{
                padding: "8px 10px",
                borderRadius: 12,
                background: langState === "uk" ? "rgba(120,160,255,0.18)" : "rgba(255,255,255,0.06)",
                border:
                  langState === "uk"
                    ? "1px solid rgba(120,160,255,0.32)"
                    : "1px solid rgba(255,255,255,0.10)",
                color: "white",
                cursor: "pointer",
              }}
            >
              UA
            </button>
            <button
              onClick={() => switchLang("en")}
              style={{
                padding: "8px 10px",
                borderRadius: 12,
                background: langState === "en" ? "rgba(120,160,255,0.18)" : "rgba(255,255,255,0.06)",
                border:
                  langState === "en"
                    ? "1px solid rgba(120,160,255,0.32)"
                    : "1px solid rgba(255,255,255,0.10)",
                color: "white",
                cursor: "pointer",
              }}
            >
              EN
            </button>
          </div>
        </div>

        <div style={{ marginTop: 14, fontSize: 22, fontWeight: 800 }}>{t(title.uk, title.en)}</div>

        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map((it) => {
            const active = pathname === it.href;
            return (
              <Link
                key={it.href}
                href={it.href}
                onClick={() => setOpen(false)}
                style={{
                  display: "block",
                  padding: "12px 14px",
                  borderRadius: 14,
                  background: active ? "rgba(120,160,255,0.18)" : "rgba(255,255,255,0.05)",
                  border: active ? "1px solid rgba(120,160,255,0.32)" : "1px solid rgba(255,255,255,0.10)",
                  color: "white",
                  textDecoration: "none",
                  fontSize: mounted && isMobile ? 20 : 18,
                }}
              >
                {t(it.label.uk, it.label.en)}
              </Link>
            );
          })}
        </div>

        <div style={{ marginTop: "auto", paddingTop: 18, fontSize: 14, opacity: 0.9 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span>{email}</span>
            <button
              onClick={copyEmail}
              style={{
                padding: "6px 10px",
                borderRadius: 12,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.10)",
                color: "white",
                cursor: "pointer",
              }}
            >
              {t("Копіювати", "Copy")}
            </button>
          </div>

          <button
            onClick={() => router.push("/account")}
            style={{
              marginTop: 12,
              width: "100%",
              padding: "10px 12px",
              borderRadius: 14,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.10)",
              color: "white",
              cursor: "pointer",
            }}
          >
            {t("Вийти", "Log out")}
          </button>
        </div>
      </aside>

      {/* Контент: на мобільному більший верхній відступ */}
      <main
        style={{
          maxWidth: 980,
          margin: "0 auto",
          paddingTop: mounted && isMobile ? 92 : 24,
          color: "white",
        }}
      >
        {langState === "uk" ? children.uk : children.en}
      </main>
    </div>
  );
}
