"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { getLang, setLang, t, type Lang } from "../i18n";

type MeResponse =
  | { authenticated: false }
  | {
      authenticated: true;
      user: {
        id?: string;
        email: string;
        name: string | null;
        avatar_url: string | null;
        points: number;
        referral?: {
          code: string;
          link: string;
          stats: {
            clicks: number;
            signups: number;
            purchases: number;
          };
          rewardPoints: number;
          rewardUsd: number;
          availableWithdrawalPoints: number;
          availableWithdrawalUsd: number;
          minWithdrawalPoints: number;
          rewardRateText: string;
          discount: {
            eligible: boolean;
            usesLeft: number;
            reservedUses: number;
            paidUses: number;
            percent: number;
          };
          withdrawals: Array<{
            id: string;
            requestedPoints: number;
            amountUsd: number;
            cardMasked: string;
            status: string;
            createdAt: string;
            updatedAt: string;
          }>;
        };
      };
    };

const PACKAGES = {
  starter: { name: "Starter", priceUsd: 7, points: 140 },
  plus: { name: "Plus", priceUsd: 20, points: 440, note: "-10%", badgeKey: "bestValue" },
  pro: { name: "Pro", priceUsd: 50, points: 1200, note: "-20%" },
  max: { name: "Max", priceUsd: 100, points: 2600, note: "-30%" },
  ultra: { name: "Ultra", priceUsd: 200, points: 5600, note: "-40%" },
} as const;

type PackId = keyof typeof PACKAGES;
type PackageMeta = (typeof PACKAGES)[PackId] & { note?: string; badgeKey?: string };

const PHOTO_COST_POINTS = 2;
const VIDEO_5S_STANDARD_COST_POINTS = 8;

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function formatDate(value: string, lang: Lang) {
  try {
    return new Intl.DateTimeFormat(lang === "uk" ? "uk-UA" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function getPackValueInfo(points: number, lang: Lang) {
  const photos = Math.floor(points / PHOTO_COST_POINTS);
  const videos = Math.floor(points / VIDEO_5S_STANDARD_COST_POINTS);

  if (lang === "uk") {
    return {
      title: "Генерацій:",
      photos: `ФОТО до ${photos}`,
      or: "або",
      videos: `ВІДЕО до ${videos}`,
    };
  }

  return {
    title: "Generations:",
    photos: `PHOTOS up to ${photos}`,
    or: "or",
    videos: `VIDEOS up to ${videos}`,
  };
}

export default function AccountPage() {
  const router = useRouter();

  const [lang, setLangState] = useState<Lang>("uk");
  const dict = t(lang);

  const [data, setData] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // bottom sheet
  const [selectedPack, setSelectedPack] = useState<PackId | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  const [promo, setPromo] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [withdrawMsg, setWithdrawMsg] = useState("");

  useEffect(() => {
    setLangState(getLang());
  }, []);

  useEffect(() => {
    fetch("/api/me", { cache: "no-store", credentials: "include" })
      .then((r) => r.json())
      .then((j) => setData(j))
      .finally(() => setLoading(false));
  }, []);

  const u = data && data.authenticated ? data.user : null;
  const referral = u?.referral ?? null;

  const selectedPackData = useMemo(() => {
    if (!selectedPack) return null;
    return PACKAGES[selectedPack];
  }, [selectedPack]);

  const selectedPackValueText = useMemo(() => {
    if (!selectedPackData) return null;
    return getPackValueInfo(selectedPackData.points, lang);
  }, [selectedPackData, lang]);

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
        body: JSON.stringify({ pack: packId, promo }),
      });

      const payload = await res.json();

      if (!res.ok) {
        alert(payload?.error || dict.paymentCreateError);
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
      alert(dict.networkError);
      setPaying(false);
    }
  }

  async function copyReferralLink() {
    if (!referral?.link) return;
    try {
      await navigator.clipboard.writeText(referral.link);
      setWithdrawMsg(lang === "uk" ? "Реферальне посилання скопійовано." : "Referral link copied.");
    } catch {
      setWithdrawMsg(lang === "uk" ? "Не вдалося скопіювати посилання." : "Failed to copy referral link.");
    }
  }

  async function submitWithdrawal() {
    if (!cardNumber.trim()) {
      setWithdrawMsg(lang === "uk" ? "Вкажи номер картки." : "Enter the card number.");
      return;
    }

    setWithdrawLoading(true);
    setWithdrawMsg("");

    try {
      const res = await fetch("/api/referrals/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardNumber }),
      });
      const payload = await res.json();

      if (!res.ok) {
        setWithdrawMsg(payload?.error || (lang === "uk" ? "Не вдалося створити заявку." : "Failed to create request."));
        return;
      }

      setCardNumber("");
      setWithdrawMsg(lang === "uk" ? "Заявку на вивід створено." : "Withdrawal request created.");

      setData((prev) => {
        if (!prev || prev.authenticated === false) return prev;
        return {
          ...prev,
          user: {
            ...prev.user,
            points: Math.max(0, prev.user.points - Number(payload?.request?.requestedPoints || 0)),
            referral: payload?.overview || prev.user.referral,
          },
        };
      });
    } catch {
      setWithdrawMsg(lang === "uk" ? "Помилка мережі." : "Network error.");
    } finally {
      setWithdrawLoading(false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 18, maxWidth: 980, margin: "0 auto" }}>
        <div className="acc-skel" />
        <div className="acc-skel" style={{ height: 92, marginTop: 14 }} />
        <div className="acc-skel" style={{ height: 340, marginTop: 14 }} />
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
        <h1 style={{ fontSize: 24, marginBottom: 8 }}>{dict.accountTitle}</h1>
        <p>{dict.signInFirst}</p>
      </div>
    );
  }

  return (
    <>
      <div className="acc-page">
        {/* Topbar */}
        <div className="acc-topbar">
          <button className="ios-btn ios-btn--ghost" onClick={() => router.push("/")}>
            ← {dict.backHome}
          </button>

          <div className="acc-lang">
            <button
              className={`ios-btn ${lang === "uk" ? "ios-btn--primary" : "ios-btn--ghost"}`}
              onClick={() => {
                setLang("uk");
                setLangState("uk");
              }}
            >
              UA
            </button>
            <button
              className={`ios-btn ${lang === "en" ? "ios-btn--primary" : "ios-btn--ghost"}`}
              onClick={() => {
                setLang("en");
                setLangState("en");
              }}
            >
              EN
            </button>
          </div>

          <button className="ios-btn ios-btn--danger" onClick={() => signOut({ callbackUrl: "/" })}>
            {dict.signOut}
          </button>
        </div>

        {/* Header */}
        <div className="acc-header acc-appear">
          <div className="acc-headerInner">
            <div className="acc-user">
              <div className="acc-name">{u.name ?? dict.userFallback}</div>
              <div className="acc-email">{u.email}</div>
            </div>

            <div className="acc-balance">
              <div className="acc-balanceLabel">{dict.balance}</div>
              <div className="acc-balanceValue">
                <span className="acc-balanceNum">{u.points}</span> {dict.pointsWord}
              </div>
            </div>
          </div>
        </div>

        {referral ? (
          <div className="acc-refGrid">
            <section className="acc-card acc-appear2">
              <div className="acc-cardTop">
                <h2 className="acc-title">{lang === "uk" ? "Реферальна програма" : "Referral program"}</h2>
                <div className="acc-chip">{referral.code}</div>
              </div>
              <div className="acc-subtitle">
                {lang === "uk"
                  ? "Запрошений користувач отримує -10% на перші 3 покупки пакетів, а ти отримуєш 50 балів за кожну оплачену покупку."
                  : "Invited users get 10% off their first 3 point package purchases, and you get 50 points for every paid order."}
              </div>
              <div className="acc-linkBox">{referral.link}</div>
              <div className="acc-actions" style={{ marginTop: 14 }}>
                <button type="button" className="ios-btn ios-btn--primary" onClick={copyReferralLink}>
                  {lang === "uk" ? "Скопіювати посилання" : "Copy link"}
                </button>
                <div className="acc-muted">
                  {lang === "uk"
                    ? `Курс виводу: ${referral.rewardRateText}. Мінімум ${referral.minWithdrawalPoints} балів.`
                    : `Payout rate: ${referral.rewardRateText}. Minimum ${referral.minWithdrawalPoints} points.`}
                </div>
              </div>
            </section>

            <section className="acc-card acc-appear3">
              <div className="acc-cardTop">
                <h2 className="acc-title">{lang === "uk" ? "Статистика" : "Statistics"}</h2>
                {referral.discount.usesLeft > 0 ? (
                  <div className="acc-chip acc-chip--accent">
                    {lang === "uk"
                      ? `Для тебе ще ${referral.discount.usesLeft} покупок зі знижкою`
                      : `${referral.discount.usesLeft} discounted purchases left`}
                  </div>
                ) : null}
              </div>
              <div className="acc-stats">
                <div className="acc-stat">
                  <span className="acc-statNum">{referral.stats.clicks}</span>
                  <span className="acc-statLabel">{lang === "uk" ? "Переходи" : "Clicks"}</span>
                </div>
                <div className="acc-stat">
                  <span className="acc-statNum">{referral.stats.signups}</span>
                  <span className="acc-statLabel">{lang === "uk" ? "Авторизації" : "Sign-ins"}</span>
                </div>
                <div className="acc-stat">
                  <span className="acc-statNum">{referral.stats.purchases}</span>
                  <span className="acc-statLabel">{lang === "uk" ? "Покупки" : "Purchases"}</span>
                </div>
              </div>
              <div className="acc-payoutSummary">
                <div>
                  <div className="acc-muted">{lang === "uk" ? "Зароблено" : "Earned"}</div>
                  <div className="acc-money">{referral.rewardPoints} {dict.pointsWord} / ${referral.rewardUsd.toFixed(2)}</div>
                </div>
                <div>
                  <div className="acc-muted">{lang === "uk" ? "Доступно до виводу" : "Available for payout"}</div>
                  <div className="acc-money">{referral.availableWithdrawalPoints} {dict.pointsWord} / ${referral.availableWithdrawalUsd.toFixed(2)}</div>
                </div>
              </div>
            </section>
          </div>
        ) : null}

        {referral ? (
          <section className="acc-card acc-appear3" style={{ marginTop: 18 }}>
            <div className="acc-cardTop">
              <h2 className="acc-title">{lang === "uk" ? "Вивід коштів" : "Withdraw funds"}</h2>
              <div className="acc-chip">
                {lang === "uk" ? `Мінімум ${referral.minWithdrawalPoints} балів` : `Min ${referral.minWithdrawalPoints} points`}
              </div>
            </div>
            <div className="acc-subtitle">
              {lang === "uk"
                ? "Коли накопичиш мінімум 300 реферальних балів, можеш створити заявку на вивід. Після створення заявки бали резервуються."
                : "Once you collect at least 300 referral points, you can create a payout request. Reserved points are locked while the request is in progress."}
            </div>
            <div className="acc-withdrawRow">
              <input
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
                placeholder={lang === "uk" ? "Номер банківської картки" : "Bank card number"}
                className="acc-input"
              />
              <button
                type="button"
                className="ios-btn ios-btn--primary"
                onClick={submitWithdrawal}
                disabled={withdrawLoading || referral.availableWithdrawalPoints < referral.minWithdrawalPoints}
              >
                {withdrawLoading ? (lang === "uk" ? "Створюємо..." : "Creating...") : (lang === "uk" ? "Вивести кошти" : "Request payout")}
              </button>
            </div>
            {withdrawMsg ? <div className="acc-hint">{withdrawMsg}</div> : null}

            <div className="acc-withdrawList">
              {referral.withdrawals.length === 0 ? (
                <div className="acc-empty">{lang === "uk" ? "Заявок ще немає." : "No payout requests yet."}</div>
              ) : (
                referral.withdrawals.map((item) => (
                  <div key={item.id} className="acc-withdrawItem">
                    <div>
                      <div className="acc-withdrawTitle">
                        {item.requestedPoints} {dict.pointsWord} / ${item.amountUsd.toFixed(2)}
                      </div>
                      <div className="acc-muted">{item.cardMasked}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className={`acc-chip acc-chip--${item.status.toLowerCase()}`}>{item.status}</div>
                      <div className="acc-muted">{formatDate(item.createdAt, lang)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        ) : null}

        {/* Section */}
        <div className="acc-section acc-appear2">
          <h2 className="acc-title">{dict.buyPoints}</h2>
          {referral?.discount.usesLeft ? (
            <div className="acc-subtitle">
              {lang === "uk"
                ? `Реферальна знижка -${referral.discount.percent}% доступна ще на ${referral.discount.usesLeft} покупки.`
                : `Referral discount -${referral.discount.percent}% is available for ${referral.discount.usesLeft} more purchases.`}
            </div>
          ) : null}
        </div>

        {/* Packages */}
        <div className="acc-grid">
          {(["starter", "plus", "pro", "max", "ultra"] as const).map((packId, idx) => {
            const p = PACKAGES[packId] as PackageMeta;
            const note = p.note;
            const badgeKey = p.badgeKey;
            const isFeatured = packId === "plus";
            const packValueText = getPackValueInfo(p.points, lang);

            const delayMs = clamp(90 + idx * 75, 0, 520);

            return (
              <button
                key={packId}
                type="button"
                className={`acc-pack acc-stagger ${isFeatured ? "featured" : ""}`}
                style={{ ["--d" as const]: `${delayMs}ms` } as CSSProperties}
                onClick={() => {
                  setSelectedPack(packId);
                  setSheetOpen(true);
                }}
              >
                <div className="acc-packTop">
                  <div className="acc-packName">{p.name}</div>

                  {badgeKey ? <div className="acc-badge">{dict[badgeKey] ?? ""}</div> : null}
                  {note ? <div className="acc-note">{note}</div> : <div />}
                </div>

                <div className="acc-packMid">
                  <div className="acc-packPrice">${p.priceUsd}</div>
                  <div className="acc-packPoints">{p.points} {dict.pointsWord}</div>
                </div>

                <div className="acc-packValue">
                  <div>{packValueText.title}</div>
                  <div>{packValueText.photos}</div>
                  <div>{packValueText.or}</div>
                  <div>{packValueText.videos}</div>
                </div>

                <div className="acc-packCta">{dict.buy}</div>
              </button>
            );
          })}
        </div>

      </div>

      {/* Bottom sheet */}
      <div
        className={`acc-overlay ${sheetOpen ? "open" : ""}`}
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
          <div className="acc-handle" />
          <div className="acc-sheetTitle">{dict.confirmTitle}</div>

          {selectedPackData ? (
            <div className="acc-sheetCard">
              <div className="acc-row">
                <div className="acc-sheetPack">{selectedPackData.name}</div>
                {"note" in (selectedPackData as PackageMeta) ? (
                  <div className="acc-note" style={{ marginLeft: "auto" }}>
                    {(selectedPackData as PackageMeta).note}
                  </div>
                ) : (
                  <div />
                )}
              </div>

              <div className="acc-row" style={{ marginTop: 10 }}>
                <div className="acc-sheetPrice">
                  ${selectedPackData.priceUsd}
                  {(promo.trim().toUpperCase() === "TEST5" || referral?.discount.usesLeft) && (
                    <span style={{ marginLeft: 10, fontSize: 18, opacity: 0.8 }}>
                      → $
                      {(
                        selectedPackData.priceUsd *
                        (1 -
                          (promo.trim().toUpperCase() === "TEST5" ? 0.1 : 0) -
                          (referral?.discount.usesLeft ? 0.1 : 0))
                      ).toFixed(2)}
                    </span>
                  )}
                </div>
                <div className="acc-sheetPts">
                  {selectedPackData.points} {dict.pointsWord}
                </div>
              </div>

              {(promo.trim().toUpperCase() === "TEST5" || referral?.discount.usesLeft) && (
                <div style={{ marginTop: 4, fontSize: 13, color: "#9fd3ff" }}>
                  {lang === "uk"
                    ? `Застосуємо знижку: ${promo.trim().toUpperCase() === "TEST5" ? "промокод -10%" : ""}${
                        promo.trim().toUpperCase() === "TEST5" && referral?.discount.usesLeft ? " + " : ""
                      }${referral?.discount.usesLeft ? "реферал -10%" : ""}`
                    : `Discount applies: ${promo.trim().toUpperCase() === "TEST5" ? "promo -10%" : ""}${
                        promo.trim().toUpperCase() === "TEST5" && referral?.discount.usesLeft ? " + " : ""
                      }${referral?.discount.usesLeft ? "referral -10%" : ""}`}
                </div>
              )}

              {selectedPackValueText && (
                <div className="acc-sheetValue">
                  <div>{selectedPackValueText.title}</div>
                  <div>{selectedPackValueText.photos}</div>
                  <div>{selectedPackValueText.or}</div>
                  <div>{selectedPackValueText.videos}</div>
                </div>
              )}

              <div style={{ marginTop: 12 }}>
                <input
                  value={promo}
                  onChange={(e) => setPromo(e.target.value)}
                  placeholder="Промокод (необов'язково)"
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.18)",
                    background: "rgba(0,0,0,0.22)",
                    color: "white",
                    outline: "none",
                    fontSize: 15,
                  }}
                />
              </div>

              <div className="acc-actions">
                <button
                  type="button"
                  className="ios-btn ios-btn--ghost"
                  disabled={paying}
                  onClick={() => {
                    setSheetOpen(false);
                    setSelectedPack(null);
                  }}
                >
                  {dict.back}
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
                  {paying ? dict.paying : dict.buyPack}
                </button>
              </div>
            </div>
          ) : (
            <div className="acc-sheetCard" style={{ opacity: 0.85 }}>
              {dict.choosePack}
            </div>
          )}
        </div>
      </div>

      <style jsx global>{`
        /* Layout */
        .acc-page {
          padding: 16px;
          max-width: 980px;
          margin: 0 auto;
          padding-bottom: 44px;
        }

        .acc-topbar {
          position: sticky;
          top: 0;
          z-index: 6;
          display: flex;
          gap: 10px;
          align-items: center;
          padding: 10px 0;
          backdrop-filter: blur(14px) saturate(140%);
          -webkit-backdrop-filter: blur(14px) saturate(140%);
        }

        .acc-lang {
          display: inline-flex;
          gap: 8px;
          margin-left: auto;
        }

        .acc-header {
          border-radius: 20px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.03));
          box-shadow: 0 18px 60px rgba(0, 0, 0, 0.35);
          backdrop-filter: blur(18px) saturate(140%);
          -webkit-backdrop-filter: blur(18px) saturate(140%);
          position: relative;
          overflow: hidden;
        }

        /* Neon background like mockup */
        .acc-header::before {
          content: "";
          position: absolute;
          inset: -80px;
          background:
            radial-gradient(800px 400px at 15% 10%, rgba(10,132,255,0.25), transparent 60%),
            radial-gradient(900px 420px at 85% 0%, rgba(255,70,120,0.22), transparent 62%),
            radial-gradient(700px 460px at 50% 120%, rgba(120,80,255,0.18), transparent 60%);
          filter: blur(18px);
          opacity: 0.95;
          pointer-events: none;
        }

        .acc-headerInner {
          position: relative;
          display: flex;
          gap: 12px;
          align-items: center;
          padding: 16px;
        }

        .acc-user {
          min-width: 0;
        }
        .acc-name {
          font-size: 22px;
          font-weight: 900;
          color: rgba(255, 255, 255, 0.94);
          line-height: 1.12;
        }
        .acc-email {
          margin-top: 5px;
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
          font-weight: 850;
          color: rgba(255, 255, 255, 0.92);
        }
        .acc-balanceNum {
          font-size: 34px;
          font-weight: 950;
          letter-spacing: -0.5px;
        }

        .acc-section {
          margin-top: 18px;
        }
        .acc-refGrid {
          margin-top: 18px;
          display: grid;
          grid-template-columns: 1fr;
          gap: 14px;
        }
        .acc-card {
          border-radius: 22px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.04);
          box-shadow: 0 22px 70px rgba(0, 0, 0, 0.32);
          backdrop-filter: blur(18px) saturate(140%);
          -webkit-backdrop-filter: blur(18px) saturate(140%);
          padding: 16px;
        }
        .acc-cardTop {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 10px;
        }
        .acc-chip {
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.08);
          padding: 7px 10px;
          font-size: 12px;
          font-weight: 800;
          color: rgba(255, 255, 255, 0.92);
        }
        .acc-chip--accent {
          border-color: rgba(10, 132, 255, 0.45);
          background: rgba(10, 132, 255, 0.18);
        }
        .acc-chip--pending {
          background: rgba(255, 196, 61, 0.15);
          border-color: rgba(255, 196, 61, 0.4);
        }
        .acc-chip--processing {
          background: rgba(10, 132, 255, 0.18);
          border-color: rgba(10, 132, 255, 0.4);
        }
        .acc-chip--paid {
          background: rgba(52, 199, 89, 0.18);
          border-color: rgba(52, 199, 89, 0.4);
        }
        .acc-chip--rejected {
          background: rgba(255, 69, 58, 0.18);
          border-color: rgba(255, 69, 58, 0.4);
        }
        .acc-linkBox {
          margin-top: 14px;
          padding: 12px 14px;
          border-radius: 14px;
          background: rgba(0, 0, 0, 0.22);
          border: 1px solid rgba(255, 255, 255, 0.08);
          font-size: 14px;
          line-height: 1.45;
          color: rgba(255, 255, 255, 0.85);
          word-break: break-all;
        }
        .acc-muted {
          font-size: 13px;
          color: rgba(255, 255, 255, 0.7);
          line-height: 1.4;
        }
        .acc-stats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          margin-top: 14px;
        }
        .acc-stat {
          border-radius: 16px;
          padding: 14px 12px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .acc-statNum {
          display: block;
          font-size: 24px;
          font-weight: 900;
          color: rgba(255, 255, 255, 0.95);
        }
        .acc-statLabel {
          display: block;
          margin-top: 4px;
          font-size: 13px;
          color: rgba(255, 255, 255, 0.72);
        }
        .acc-payoutSummary {
          margin-top: 14px;
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
        }
        .acc-money {
          margin-top: 4px;
          font-size: 18px;
          font-weight: 850;
          color: rgba(255, 255, 255, 0.94);
        }
        .acc-withdrawRow {
          margin-top: 14px;
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
        }
        .acc-input {
          width: 100%;
          padding: 12px 14px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(0, 0, 0, 0.22);
          color: white;
          outline: none;
          font-size: 15px;
        }
        .acc-withdrawList {
          margin-top: 16px;
          display: grid;
          gap: 10px;
        }
        .acc-withdrawItem {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 14px;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(255, 255, 255, 0.04);
        }
        .acc-withdrawTitle {
          font-size: 15px;
          font-weight: 800;
          color: rgba(255, 255, 255, 0.92);
        }
        .acc-empty {
          border-radius: 16px;
          padding: 14px;
          background: rgba(255, 255, 255, 0.03);
          color: rgba(255, 255, 255, 0.72);
        }
        .acc-title {
          margin: 0;
          font-size: 22px;
          font-weight: 950;
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
          gap: 14px;
          align-items: stretch;
          justify-items: stretch;
          grid-auto-flow: row;
        }

        @media (min-width: 900px) {
          .acc-page {
            padding: 24px;
          }
          .acc-refGrid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .acc-grid {
            grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          }
          .acc-email {
            max-width: 520px;
          }
        }

        /* Package card with neon gradient border */
        .acc-pack {
          text-align: left;
          padding: 14px;
          border-radius: 22px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.04);
          box-shadow: 0 22px 70px rgba(0, 0, 0, 0.42);
          backdrop-filter: blur(18px) saturate(140%);
          -webkit-backdrop-filter: blur(18px) saturate(140%);
          cursor: pointer;
          outline: none;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
          position: relative;
          overflow: hidden;
          transform: none;
          transition: transform 0.14s ease, filter 0.14s ease;
        }

        .acc-pack:hover {
          transform: translateY(-2px);
        }

        .acc-pack:active {
          transform: scale(0.985);
          filter: brightness(1.05);
        }

        /* gradient border */
        .acc-pack::before {
          content: "";
          position: absolute;
          inset: 0;
          padding: 1px;
          border-radius: 22px;
          background: linear-gradient(90deg, rgba(10,132,255,0.9), rgba(255,70,120,0.9), rgba(120,80,255,0.9));
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          opacity: 0.45;
          pointer-events: none;
        }

        /* glow */
        .acc-pack::after {
          content: "";
          position: absolute;
          inset: -40px;
          background:
            radial-gradient(420px 180px at 10% 10%, rgba(10,132,255,0.28), transparent 60%),
            radial-gradient(420px 180px at 90% 10%, rgba(255,70,120,0.20), transparent 62%),
            radial-gradient(520px 220px at 50% 120%, rgba(120,80,255,0.18), transparent 60%);
          filter: blur(18px);
          opacity: 0.55;
          pointer-events: none;
        }

        .acc-packTop {
          position: relative;
          display: flex;
          align-items: center;
          gap: 10px;
          z-index: 1;
        }

        .acc-packName {
          font-weight: 950;
          font-size: 18px;
          color: rgba(255, 255, 255, 0.94);
        }

        .acc-note {
          margin-left: auto;
          font-size: 13px;
          font-weight: 900;
          color: rgba(255, 255, 255, 0.92);
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(0, 0, 0, 0.22);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
        }

        .acc-badge {
          font-size: 12px;
          font-weight: 950;
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid rgba(10, 132, 255, 0.35);
          background: rgba(10, 132, 255, 0.18);
          color: rgba(255, 255, 255, 0.95);
        }

        .acc-packMid {
          position: relative;
          z-index: 1;
          margin-top: 12px;
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 10px;
        }

        .acc-packPrice {
          font-size: 30px;
          font-weight: 980;
          letter-spacing: -0.6px;
          color: rgba(255, 255, 255, 0.94);
        }

        .acc-packPoints {
          font-size: 14px;
          color: rgba(255, 255, 255, 0.78);
          font-weight: 800;
        }

        .acc-packValue {
          position: relative;
          z-index: 1;
          margin-top: 10px;
          min-height: 88px;
          font-size: 14px;
          line-height: 1.2;
          color: rgba(255, 255, 255, 0.82);
          font-weight: 800;
        }

        .acc-packValue > div:first-child {
          margin-bottom: 4px;
          font-size: 13px;
          color: rgba(255, 255, 255, 0.66);
          font-weight: 700;
        }

        .acc-packCta {
          position: relative;
          z-index: 1;
          margin-top: 12px;
          width: 100%;
          padding: 12px 12px;
          border-radius: 16px;
          text-align: center;
          font-weight: 950;
          color: rgba(255, 255, 255, 0.95);
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.12);
        }

        /* featured: slightly stronger glow + subtle breathing (optional) */
        .acc-pack.featured::before {
          opacity: 0.75;
        }
        .acc-pack.featured::after {
          opacity: 0.75;
        }
        .acc-pack.featured {
          animation: glowPulse 3.2s ease-in-out infinite;
        }
        @keyframes glowPulse {
          0% { filter: brightness(1); }
          50% { filter: brightness(1.08); }
          100% { filter: brightness(1); }
        }

        .acc-hint {
          margin-top: 14px;
          font-size: 13px;
          color: rgba(255, 255, 255, 0.72);
          line-height: 1.35;
        }

        /* Appear animations */
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
        .acc-stagger {
          opacity: 1;
          transform: none;
          animation: accCardIn 420ms ease-out both;
          animation-delay: var(--d, 0ms);
        }

        @keyframes accIn {
          from { opacity: 0; transform: translateY(10px); filter: blur(6px); }
          to { opacity: 1; transform: translateY(0); filter: blur(0); }
        }
        @keyframes accCardIn {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: none; }
        }

        @media (prefers-reduced-motion: reduce) {
          .acc-appear, .acc-appear2, .acc-appear3, .acc-stagger, .acc-pack.featured {
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
            filter: none !important;
          }
          .acc-pack { transition: none !important; }
        }

        @media (max-width: 640px) {
          .acc-stats {
            grid-template-columns: 1fr;
          }
        }

        /* Sheet */
        .acc-overlay {
          position: fixed;
          inset: 0;
          z-index: 1000;
          background: rgba(0, 0, 0, 0.48);
          opacity: 0;
          pointer-events: none;
          transition: opacity 180ms ease;
        }
        .acc-overlay.open {
          opacity: 1;
          pointer-events: auto;
        }

        .acc-sheet {
          position: fixed;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%) scale(0.98);
          width: 100%;
          max-width: 420px;
          border-radius: 22px;
          padding: 16px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(8, 10, 14, 0.9);
          backdrop-filter: blur(18px) saturate(140%);
          -webkit-backdrop-filter: blur(18px) saturate(140%);
          box-shadow: 0 30px 120px rgba(0, 0, 0, 0.7);
          z-index: 1001;
          transition: transform 240ms cubic-bezier(0.2, 0.85, 0.2, 1);
        }
        .acc-sheet.open {
          transform: translate(-50%, -50%) scale(1);
        }

        @media (max-width: 640px) {
          .acc-sheet {
            left: 0;
            right: 0;
            bottom: 0;
            top: auto;
            transform: translateY(105%);
            max-width: none;
            border-radius: 24px 24px 0 0;
          }

          .acc-sheet.open {
            transform: translateY(0);
          }
        }

        .acc-handle {
          width: 52px;
          height: 5px;
          border-radius: 99px;
          background: rgba(255, 255, 255, 0.22);
          margin: 6px auto 10px;
        }

        .acc-sheetTitle {
          text-align: center;
          font-weight: 950;
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

        .acc-row {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .acc-sheetPack {
          font-weight: 950;
          font-size: 18px;
          color: rgba(255, 255, 255, 0.94);
        }

        .acc-sheetPrice {
          font-size: 28px;
          font-weight: 980;
          color: rgba(255, 255, 255, 0.94);
        }

        .acc-sheetPts {
          margin-left: auto;
          font-size: 14px;
          color: rgba(255, 255, 255, 0.78);
          font-weight: 900;
        }

        .acc-sheetValue {
          margin-top: 12px;
          padding: 10px 12px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          background: rgba(255, 255, 255, 0.04);
          font-size: 15px;
          line-height: 1.2;
          color: rgba(255, 255, 255, 0.86);
          font-weight: 800;
        }

        .acc-sheetValue > div:first-child {
          margin-bottom: 4px;
          font-size: 13px;
          color: rgba(255, 255, 255, 0.66);
          font-weight: 700;
        }

        .acc-actions {
          margin-top: 12px;
          display: flex;
          gap: 10px;
          align-items: center;
        }
      `}</style>
    </>
  );
}
