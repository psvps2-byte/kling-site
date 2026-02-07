"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Mail } from "lucide-react";

export default function AuthPage() {
  const [email, setEmail] = useState("");

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

      <div style={{ marginTop: 16 }}>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Введи email"
          type="email"
          style={input}
        />

        <button
          onClick={() => {
            if (!email) return;
            signIn("email", { email, callbackUrl: "/" });
          }}
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
      </div>
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
  border: "1px solid rgba(255,255,255,0.2)",
  background: "rgba(0,0,0,0.25)",
  color: "white",
  outline: "none",
  marginBottom: 12,
  fontSize: 16,
};
