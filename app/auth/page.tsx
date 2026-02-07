// app/auth/page.tsx
"use client";

import React from "react";
import { signIn } from "next-auth/react";
import { Mail } from "lucide-react";

export default function AuthPage() {
  const [showEmail, setShowEmail] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [status, setStatus] = React.useState<"idle" | "sending" | "sent" | "error">("idle");

  async function onEmailSignIn() {
    // 1) перший клік — просто показуємо поле
    if (!showEmail) {
      setShowEmail(true);
      setStatus("idle");
      return;
    }

    // 2) другий клік — якщо email пустий, нічого не робимо
    if (!email.trim()) return;

    try {
      setStatus("sending");

      // ВАЖЛИВО: redirect: false — тоді сторінка НЕ зміниться
      const res = await signIn("email", {
        email: email.trim(),
        callbackUrl: "/",
        redirect: false,
      });

      if (res?.error) {
        setStatus("error");
      } else {
        setStatus("sent");
      }
    } catch {
      setStatus("error");
    }
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

      {showEmail && (
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Введи email"
          inputMode="email"
          autoComplete="email"
          style={input}
        />
      )}

      <button
        onClick={onEmailSignIn}
        disabled={status === "sending"}
        style={{
          ...btnPrimary,
          background: "rgba(255,255,255,0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          opacity: status === "sending" ? 0.7 : 1,
        }}
      >
        <Mail size={18} />
        {status === "sending" ? "Відправляю..." : "Увійти через пошту"}
      </button>

      {status === "sent" && (
        <div style={msgOk}>✅ Відправили, перевір пошту</div>
      )}

      {status === "error" && (
        <div style={msgErr}>❌ Не вийшло. Спробуй ще раз</div>
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

const input: React.CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.18)",
  background: "rgba(0,0,0,0.22)",
  color: "white",
  outline: "none",
  marginBottom: 12,
  fontSize: 16,
};

const msgOk: React.CSSProperties = {
  marginTop: 6,
  fontSize: 14,
  opacity: 0.9,
};

const msgErr: React.CSSProperties = {
  marginTop: 6,
  fontSize: 14,
  opacity: 0.9,
};
