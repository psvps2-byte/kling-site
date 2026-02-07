// app/auth/page.tsx
"use client";

import React from "react";
import { signIn } from "next-auth/react";
import { Mail } from "lucide-react";

export default function AuthPage() {
  const [showEmail, setShowEmail] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [status, setStatus] = React.useState<"idle" | "sending" | "sent" | "error">("idle");

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");

    const res = await signIn("email", {
      email,
      callbackUrl: "/",
      redirect: false, // щоб не перекидало кудись, а ми показали "лист відправлено"
    });

    if (res?.ok) setStatus("sent");
    else setStatus("error");
  }

  return (
    <div style={wrap}>
      <button
        onClick={() => signIn("google", { callbackUrl: "/" })}
        style={{
          ...btnPrimary,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
        }}
      >
        <img src="/google.svg?v=1" width={18} height={18} alt="Google" />
        Увійти через Google
      </button>

      <button
        onClick={() => setShowEmail((v) => !v)}
        style={{
          ...btnPrimary,
          background: "rgba(255,255,255,0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
        }}
      >
        <Mail size={18} />
        Увійти через пошту
      </button>

      {showEmail && (
        <form onSubmit={submitEmail} style={box}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Введи email</div>

          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="name@email.com"
            required
            style={input}
          />

          <button
            type="submit"
            disabled={status === "sending"}
            style={{
              ...btnPrimary,
              marginBottom: 0,
              opacity: status === "sending" ? 0.7 : 1,
            }}
          >
            {status === "sending" ? "Надсилаю..." : "Надіслати посилання"}
          </button>

          {status === "sent" && (
            <div style={msgOk}>Готово. Перевір пошту (і “Spam/Promotions” теж).</div>
          )}
          {status === "error" && (
            <div style={msgErr}>Не вийшло надіслати. Перевір RESEND_API_KEY і домен.</div>
          )}
        </form>
      )}
    </div>
  );
}

const wrap: React.CSSProperties = {
  maxWidth: 420,
  margin: "60px auto",
  padding: 16,
  color: "white",
};

const btnPrimary: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 12,
  border: "0px",
  background: "rgba(255,255,255,0.14)",
  color: "white",
  cursor: "pointer",
  marginBottom: 12,
  fontSize: 16,
  fontWeight: 700,
};

const box: React.CSSProperties = {
  marginTop: 8,
  padding: 14,
  borderRadius: 12,
  background: "rgba(0,0,0,0.25)",
  border: "1px solid rgba(255,255,255,0.12)",
};

const input: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.18)",
  background: "rgba(255,255,255,0.08)",
  color: "white",
  outline: "none",
  marginBottom: 10,
  fontSize: 16,
};

const msgOk: React.CSSProperties = {
  marginTop: 10,
  fontSize: 14,
  opacity: 0.9,
};

const msgErr: React.CSSProperties = {
  marginTop: 10,
  fontSize: 14,
  opacity: 0.9,
};
