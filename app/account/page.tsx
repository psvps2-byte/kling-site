"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";

type MeResponse =
  | { authenticated: false }
  | {
      authenticated: true;
      user: {
        email: string;
        name: string | null;
        avatar_url: string | null;
        points: number;
      };
    };

const PACKAGES = {
  starter: { name: "Starter", priceUsd: 7, points: 140 },
  plus: { name: "Plus", priceUsd: 20, points: 440, note: "-10%" },
  pro: { name: "Pro", priceUsd: 50, points: 1200, note: "-20%" },
  max: { name: "Max", priceUsd: 100, points: 2600, note: "-30%" },
  ultra: { name: "Ultra", priceUsd: 200, points: 5600, note: "-40%" },
} as const;

type PackId = keyof typeof PACKAGES;

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export default function AccountPage() {
  const router = useRouter();
  const [data, setData] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // bottom sheet
  const [selectedPack, setSelectedPack] = useState<PackId | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    fetch("/api/me", { cache: "no-store", credentials: "include" })
      .then((r) => r.json())
      .then((j) => setData(j))
      .finally(() => setLoading(false));
  }, []);

  const u = data && data.authenticated ? data.user : null;

  const selectedPackData = useMemo(() => {
    if (!selectedPack) return null;
    return PACKAGES[selectedPack];
  }, [selectedPack]);

  // close on ESC
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSheetOpen(false);
        setSelectedPack(null);
        setPaying(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // prevent background scroll when sheet open
  useEffect(() => {
    if (!sheetOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sheetOpen]);

  async function startPayment(packId: PackId) {
    setPaying(true);
    try {
      const res = await fetch("/api/payments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pack: packId }),
      });

      const payload = await res.json();

      if (!res.ok) {
        alert(payload?.error || "Помилка створення платежу");
        setPaying(false);
        return;
      }

      const form = document.createElement("form");
      form.method = "POST";
      form.action = "https://secure.wayforpay.com/pay";

      Object.entries(payload).forEach(([k, v]) => {
        if (Array.isArray(v)) {
          v.forEach((item, i) => {
            const input = document.createElement("input");
            input.type = "hidden";
            input.name = `${k}[${i}]`;
            input.value = String(item);
            form.appendChild(input);
          });
          return;
        }

        const input = document.createElement("input");
        input.type = "hidden";
        input.name = k;
        input.value = String(v);
        form.appendChild(input);
      });

      document.body.appendChild(form);
      form.submit();
    } catch {
      alert("Помилка мережі");
      setPaying(false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 18, maxWidth: 980, margin: "0 auto" }}>
        <div className="acc-skel" />
        <div className="acc-skel" style={{ height: 90, marginTop: 14 }} />
        <div className="acc-skel" style={{ height: 320, marginTop: 14 }} />
        <style jsx>{`
          .acc-skel {
            border-radius: 18px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            background: rgba(255, 255, 255, 0.06);
            height: 56px;
            position: relative;
            overflow: hidden;
          }
          .acc-skel::after {
            content: "";
            position: absolute;
            inset: 0;
            transform: translateX(-60%);
            background: linear-gradient(
              90deg,
              rgba(255, 255, 255, 0) 0%,
              rgba(255, 255, 255, 0.14) 45%,
              rgba(255, 255, 255, 0) 90%
            );
            animation: shimmer 1.2s ease-in-out infinite;
          }
          @keyframes shimmer {
            0% {
              transform: translateX(-60%);
            }
            100% {
              transform: translateX(60%);
            }
          }
          @media (prefers-reduced-motion: reduce) {
            .acc-skel::after {
              animation: none;
            }
          }
        `}</style>
      </div>
    );
  }

  if (!data || data.authenticated === false || !u) {
    return (
      <div style={{ padding: 18, maxWidth: 980, margin: "0 auto" }}>
        <h1 style={{ fontSize: 24, marginBottom: 8 }}>Кабінет</h1>
        <p>Спочатку увійди через Google.</p>
      </div>
    );
  }

  const packEntries = Object.entries(PACKAGES) as [PackId, (typeof PACKAGES)[PackId]][];

  return (
    <>
      <div className="acc-page">
        {/* Top actions */}
        <div className="acc-topbar">
          <button
            className="ios-btn ios-btn--ghost"
            onClick={() => router.push("/")}
            style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
          >
            ← На головну
          </button>

          <button
            className="ios-btn ios-btn--danger"
            onClick={() => signOut({ callbackUrl: "/" })}
            style={{ marginLeft: "auto" }}
          >
            Вийти
          </button>
        </div>

        {/* Header card */}
        <div className="acc-card acc-card--header acc-appear">
          <div className="acc-user">
            <div className="acc-userMeta">
              <div className="acc-name">{u.name ?? "Користувач"}</div>
              <div className="acc-email">{u.email}</div>
            </div>

            <div className="acc-balance">
              <div className="acc-balanceLabel">Баланс</div>
              <div className="acc-balanceValue">
                <span className="acc-balanceNum">{u.points}</span> балів
              </div>
            </div>
          </div>
        </div>

        {/* Section title */}
        <div className="acc-section acc-appear2">
          <h2 className="acc-title">Купити бали</h2>
          <div className="acc-subtitle">Вибери пакет — оплата займає ~30 секунд</div>
        </div>

        {/* Packages */}
        <div className="acc-grid">
          {packEntries.map(([packId, p], idx) => {
            const note = (p as any)?.note as string | undefined;
            const delayMs = clamp(80 + idx * 70, 0, 420);

            return (
              <button
                key={packId}
                type="button"
                className={`acc-pack acc-stagger`}
                style={{ ["--d" as any]: `${delayMs}ms` }}
                onClick={() => {
                  setSelectedPack(packId);
                  setSheetOpen(true);
                }}
              >
                <div className="acc-packTop">
                  <div className="acc-packName">{p.name}</div>
                  {note ? <div className="acc-packNote">{note}</div> : <div />}
                </div>

                <div className="acc-packMid">
                  <div className="acc-packPrice">${p.priceUsd}</div>
                  <div className="acc-packPoints">{p.points} балів</div>
                </div>

                <div className="acc-packCta">Купити</div>
              </button>
            );
          })}
        </div>

        {/* Small hint */}
        <div className="acc-hint acc-appear3">
          Після оплати бали зарахуються автоматично. Якщо щось піде не так — напиши в підтримку.
        </div>
      </div>

      {/* Bottom Sheet */}
      <div
        className={`acc-sheetOverlay ${sheetOpen ? "open" : ""}`}
        onMouseDown={() => {
          if (!paying) {
            setSheetOpen(false);
            setSelectedPack(null);
          }
        }}
        onTouchStart={() => {
          if (!paying) {
            setSheetOpen(false);
            setSelectedPack(null);
          }
        }}
      >
        <div
          className={`acc-sheet ${sheetOpen ? "open" : ""}`}
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <div className="acc-sheetHandle" />

          <div className="acc-sheetTitle">Підтвердження</div>

          {selectedPackData ? (
            <div className="acc-sheetCard">
              <div className="acc-sheetRow">
                <div style={{ fontWeight: 800, fontSize: 18 }}>{selectedPackData.name}</div>
                {"note" in (selectedPackData as any) ? (
                  <div className="acc-packNote" style={{ marginLeft: "auto" }}>
                    {(selectedPackData as any).note}
                  </div>
                ) : (
                  <div />
                )}
              </div>

              <div className="acc-sheetRow" style={{ marginTop: 10 }}>
                <div className="acc-sheetBig">${selectedPackData.priceUsd}</div>
                <div className="acc-sheetSmall">{selectedPackData.points} балів</div>
              </div>

              <div className="acc-sheetActions">
                <button
                  type="button"
                  className="ios-btn ios-btn--ghost"
                  disabled={paying}
                  onClick={() => {
                    setSheetOpen(false);
                    setSelectedPack(null);
                  }}
                >
                  Назад
                </button>

                <button
                  type="button"
                  className="ios-btn ios-btn--primary"
                  disabled={paying || !selectedPack}
                  onClick={() => {
                    if (!selectedPack) return;
                    startPayment(selectedPack);
                  }}
                  style={{ flex: 1 }}
                >
                  {paying ? "Переходимо до оплати..." : "Купити пакет"}
                </button>
              </div>
            </div>
          ) : (
            <div className="acc-sheetCard">
              <div style={{ opacity: 0.85 }}>Оберіть пакет</div>
            </div>
          )}
        </div>
      </div>

      {/* Styles */}
      <style jsx global>{`
        .acc-page {
          padding: 16px;
          max-width: 980px;
          margin: 0 auto;
          padding-bottom: 42px;
        }

        .acc-topbar {
          position: sticky;
          top: 0;
          z-index: 5;
          display: flex;
          gap: 10px;
          padding: 10px 0;
          backdrop-filter: blur(14px) saturate(140%);
          -webkit-backdrop-filter: blur(14px) saturate(140%);
        }

        .acc-card {
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.03));
          box-shadow: 0 18px 60px rgba(0, 0, 0, 0.35);
          backdrop-filter: blur(18px) saturate(140%);
          -webkit-backdrop-filter: blur(18px) saturate(140%);
        }

        .acc-card--header {
          padding: 16px;
        }

        .acc-user {
          display: flex;
          gap: 12px;
          align-items: center;
        }

        .acc-userMeta {
          min-width: 0;
        }

        .acc-name {
          font-size: 20px;
          font-weight: 850;
          color: rgba(255, 255, 255, 0.94);
          line-height: 1.15;
        }

        .acc-email {
          margin-top: 4px;
          font-size: 14px;
          color: rgba(255, 255, 255, 0.75);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 62vw;
        }

        .acc-balance {
          margin-left: auto;
          text-align: right;
        }

        .acc-balanceLabel {
          font-size: 13px;
          color: rgba(255, 255, 255, 0.75);
        }

        .acc-balanceValue {
          margin-top: 2px;
          font-size: 18px;
          font-weight: 800;
          color: rgba(255, 255, 255, 0.92);
        }

        .acc-balanceNum {
          font-size: 30px;
          font-weight: 900;
          letter-spacing: -0.4px;
        }

        .acc-section {
          margin-top: 18px;
        }

        .acc-title {
          margin: 0;
          font-size: 20px;
          font-weight: 900;
          color: rgba(255, 255, 255, 0.94);
        }

        .acc-subtitle {
          margin-top: 6px;
          font-size: 14px;
          color: rgba(255, 255, 255, 0.75);
        }

        .acc-grid {
          margin-top: 12px;
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
        }

        /* desktop/tablet */
        @media (min-width: 900px) {
          .acc-page {
            padding: 24px;
          }
          .acc-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
          .acc-email {
            max-width: 520px;
          }
        }

        .acc-pack {
          text-align: left;
          padding: 14px;
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: radial-gradient(
              1200px 400px at 20% -20%,
              rgba(10, 132, 255, 0.18),
              rgba(0, 0, 0, 0)
            ),
            linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.03));
          box-shadow: 0 18px 60px rgba(0, 0, 0, 0.35);
          backdrop-filter: blur(18px) saturate(140%);
          -webkit-backdrop-filter: blur(18px) saturate(140%);
          cursor: pointer;
          outline: none;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
          transition: transform 0.14s ease, border-color 0.14s ease, filter 0.14s ease;
        }

        .acc-pack:active {
          transform: scale(0.985);
          filter: brightness(1.04);
          border-color: rgba(10, 132, 255, 0.35);
        }

        .acc-packTop {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .acc-packName {
          font-weight: 900;
          font-size: 18px;
          color: rgba(255, 255, 255, 0.94);
        }

        .acc-packNote {
          margin-left: auto;
          font-size: 13px;
          font-weight: 850;
          color: rgba(255, 255, 255, 0.9);
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.06);
        }

        .acc-packMid {
          margin-top: 12px;
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 10px;
        }

        .acc-packPrice {
          font-size: 28px;
          font-weight: 950;
          letter-spacing: -0.6px;
          color: rgba(255, 255, 255, 0.94);
        }

        .acc-packPoints {
          font-size: 14px;
          color: rgba(255, 255, 255, 0.78);
          font-weight: 700;
        }

        .acc-packCta {
          margin-top: 12px;
          width: 100%;
          padding: 12px 12px;
          border-radius: 14px;
          text-align: center;
          font-weight: 900;
          color: rgba(255, 255, 255, 0.95);
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.12);
        }

        .acc-hint {
          margin-top: 14px;
          font-size: 13px;
          color: rgba(255, 255, 255, 0.7);
          line-height: 1.35;
        }

        /* page appear */
        .acc-appear {
          animation: accIn 380ms ease-out both;
        }
        .acc-appear2 {
          animation: accIn 420ms ease-out both;
          animation-delay: 60ms;
        }
        .acc-appear3 {
          animation: accIn 460ms ease-out both;
          animation-delay: 110ms;
        }

        /* stagger cards */
        .acc-stagger {
          opacity: 0;
          transform: translateY(10px);
          animation: accCardIn 420ms ease-out both;
          animation-delay: var(--d, 0ms);
        }

        @keyframes accIn {
          from {
            opacity: 0;
            transform: translateY(10px);
            filter: blur(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
            filter: blur(0);
          }
        }

        @keyframes accCardIn {
          from {
            opacity: 0;
            transform: translateY(14px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .acc-appear,
          .acc-appear2,
          .acc-appear3,
          .acc-stagger {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
            filter: none !important;
          }
          .acc-pack {
            transition: none !important;
          }
        }

        /* Sheet */
        .acc-sheetOverlay {
          position: fixed;
          inset: 0;
          z-index: 1000;
          background: rgba(0, 0, 0, 0.45);
          opacity: 0;
          pointer-events: none;
          transition: opacity 180ms ease;
        }
        .acc-sheetOverlay.open {
          opacity: 1;
          pointer-events: auto;
        }

        .acc-sheet {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          transform: translateY(105%);
          transition: transform 240ms cubic-bezier(0.2, 0.85, 0.2, 1);
          padding: 10px 14px 16px;
          border-top-left-radius: 22px;
          border-top-right-radius: 22px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(8, 10, 14, 0.78);
          backdrop-filter: blur(18px) saturate(140%);
          -webkit-backdrop-filter: blur(18px) saturate(140%);
          box-shadow: 0 -20px 70px rgba(0, 0, 0, 0.55);
        }
        .acc-sheet.open {
          transform: translateY(0);
        }

        .acc-sheetHandle {
          width: 52px;
          height: 5px;
          border-radius: 99px;
          background: rgba(255, 255, 255, 0.22);
          margin: 6px auto 10px;
        }

        .acc-sheetTitle {
          text-align: center;
          font-weight: 900;
          font-size: 16px;
          color: rgba(255, 255, 255, 0.92);
          margin-bottom: 10px;
        }

        .acc-sheetCard {
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.06);
          padding: 14px;
        }

        .acc-sheetRow {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .acc-sheetBig {
          font-size: 28px;
          font-weight: 950;
          color: rgba(255, 255, 255, 0.94);
        }

        .acc-sheetSmall {
          margin-left: auto;
          font-size: 14px;
          color: rgba(255, 255, 255, 0.78);
          font-weight: 800;
        }

        .acc-sheetActions {
          margin-top: 12px;
          display: flex;
          gap: 10px;
          align-items: center;
        }
      `}</style>
    </>
  );
}
