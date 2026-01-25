// app/auth/page.tsx
"use client";

import { signIn } from "next-auth/react";

export default function AuthPage() {
  return (
    <div style={wrap}>
      <h1 style={title}>Увійти</h1>

      <button
        style={btnPrimary}
        onClick={() => signIn("google", { callbackUrl: "/" })}
      >
        Увійти через Google
      </button>

      <button
        style={btnPrimary}
        onClick={() => signIn("facebook", { callbackUrl: "/" })}
      >
        Увійти через Facebook
      </button>

      <div style={hint}>
        <div style={{ fontSize: 13, opacity: 0.85, lineHeight: 1.35 }}>
          Якщо Facebook повертає помилку — перевір у Meta:
          <div style={{ marginTop: 8 }}>
            <code style={code}>Valid OAuth Redirect URIs</code> має містити:
          </div>
          <div style={{ marginTop: 6 }}>
            <code style={code}>http://localhost:3000/api/auth/callback/facebook</code>
          </div>
          <div style={{ marginTop: 10 }}>
            А в <code style={code}>.env.local</code> має бути:
          </div>
          <div style={{ marginTop: 6 }}>
            <code style={code}>NEXTAUTH_URL=http://localhost:3000</code>
            <br />
            <code style={code}>NEXTAUTH_SECRET=...</code>
          </div>
        </div>
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

const title: React.CSSProperties = {
  fontSize: 26,
  fontWeight: 800,
  marginBottom: 18,
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

const hint: React.CSSProperties = {
  marginTop: 12,
  padding: 14,
  borderRadius: 12,
  background: "rgba(0,0,0,0.25)",
  border: "1px solid rgba(255,255,255,0.12)",
};

const code: React.CSSProperties = {
  display: "inline-block",
  padding: "2px 6px",
  borderRadius: 8,
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.12)",
};
