"use client";

import { useEffect, useState } from "react";
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
  starter: { name: "Starter", price: 7, points: 140 },
  plus: { name: "Plus", price: 20, points: 440, note: "-10%" },
  pro: { name: "Pro", price: 50, points: 1200, note: "-20%" },
  max: { name: "Max", price: 100, points: 2600, note: "-30%" },
  ultra: { name: "Ultra", price: 200, points: 5600, note: "-40%" },
};

export default function AccountPage() {
  const router = useRouter();
  const [data, setData] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/me", { cache: "no-store", credentials: "include" })
      .then((r) => r.json())
      .then((j) => setData(j))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 24 }}>Завантаження...</div>;

  if (!data || data.authenticated === false) {
    return (
      <div style={{ padding: 24 }}>
        <h1 style={{ fontSize: 24, marginBottom: 8 }}>Кабінет</h1>
        <p>Спочатку увійди через Google.</p>
      </div>
    );
  }

  const u = data.user;

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      {/* ✅ TOP ACTIONS */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <button
          className="ios-btn ios-btn--ghost"
          onClick={() => router.back()}
          style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
        >
          ← Назад
        </button>

        <button className="ios-btn ios-btn--danger" style={{ marginLeft: "auto" }} onClick={() => signOut({ callbackUrl: "/" })}>
          Вийти
        </button>
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 600 }}>{u.name ?? u.email}</div>
          <div style={{ opacity: 0.8 }}>{u.email}</div>
        </div>
        <div style={{ marginLeft: "auto", textAlign: "right" }}>
          <div style={{ opacity: 0.8 }}>Баланс</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{u.points} балів</div>
        </div>
      </div>

      <hr style={{ margin: "24px 0", opacity: 0.2 }} />

      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>Купити бали</h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
        }}
      >
        {Object.entries(PACKAGES).map(([packId, p]) => (
          <div
            key={packId}
            style={{
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12,
              padding: 14,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div style={{ fontWeight: 700 }}>{p.name}</div>
              {"note" in p ? <div style={{ opacity: 0.8 }}>{(p as any).note}</div> : <div />}
            </div>

            {/* ... тут твій текст ціни/балів, якщо є ... */}

            <button
              type="button"
              style={{
                marginTop: 12,
                width: "100%",
                padding: "10px 12px",
                borderRadius: 10,
                border: "none",
                cursor: "pointer",
              }}
              onClick={async () => {
                try {
                  const res = await fetch("/api/payments/create", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ pack: packId }),
                  });

                  const data = await res.json();

                  if (!res.ok) {
                    alert(data?.error || "Помилка створення платежу");
                    return;
                  }

                  const form = document.createElement("form");
                  form.method = "POST";
                  form.action = "https://secure.wayforpay.com/pay";

                  Object.entries(data).forEach(([k, v]) => {
                    const input = document.createElement("input");
                    input.type = "hidden";
                    input.name = k;
                    input.value = typeof v === "object" ? JSON.stringify(v) : String(v);
                    form.appendChild(input);
                  });

                  document.body.appendChild(form);
                  form.submit();
                } catch (e) {
                  alert("Помилка мережі");
                }
              }}
            >
              Купити
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
