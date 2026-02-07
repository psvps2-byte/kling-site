/// <reference types="node" />

// lib/auth.ts
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import EmailProvider from "next-auth/providers/email";

import { SupabaseAdapter } from "@auth/supabase-adapter";
import { Resend } from "resend";

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export const authOptions: NextAuthOptions = {
  useSecureCookies: true,

  // Важливо для email-login на iPhone/Safari (щоб cookie збереглася після переходу з листа)
  cookies: {
    sessionToken: {
      name: "__Secure-next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "none",
        path: "/",
        secure: true,
      },
    },
  },

  adapter: SupabaseAdapter({
    url: mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
    secret: mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
  }),

  providers: [
    GoogleProvider({
      clientId: mustEnv("GOOGLE_CLIENT_ID"),
      clientSecret: mustEnv("GOOGLE_CLIENT_SECRET"),
      authorization: { params: { prompt: "select_account" } },
    }),

    EmailProvider({
      from: "Vilna <login@vilna.pro>",
      async sendVerificationRequest({ identifier, url }) {
        const resend = new Resend(mustEnv("RESEND_API_KEY"));

        await resend.emails.send({
          from: "Vilna <login@vilna.pro>",
          to: identifier,
          subject: "Login to Vilna",
          html: `
            <div style="font-family:Arial;padding:24px">
              <h2>Login to Vilna</h2>
              <p>Click the button below to sign in:</p>

              <a href="${url}"
                style="
                  display:inline-block;
                  margin-top:12px;
                  padding:12px 18px;
                  background:#2563eb;
                  color:#ffffff;
                  border-radius:8px;
                  text-decoration:none;
                  font-weight:600;
                ">
                Sign in
              </a>

              <p style="margin-top:20px;font-size:12px;color:#666">
                If you didn’t request this email, you can safely ignore it.
              </p>
            </div>
          `,
        });
      },
    }),
  ],

  secret: mustEnv("NEXTAUTH_SECRET"),
  pages: { signIn: "/auth" },

  // Лишаємо database sessions
  session: { strategy: "database" },

  callbacks: {
    async session({ session }) {
      return session;
    },
  },

  debug: process.env.NODE_ENV === "development",
};
