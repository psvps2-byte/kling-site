// lib/auth.ts

import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import FacebookProvider from "next-auth/providers/facebook";
import EmailProvider from "next-auth/providers/email";

import { SupabaseAdapter } from "@auth/supabase-adapter";
import { Resend } from "resend";

export const authOptions: NextAuthOptions = {
  adapter: SupabaseAdapter({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    secret: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  }),

  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      authorization: { params: { prompt: "select_account" } },
    }),

    // якщо FB не потрібен — можеш лишити закоментованим
    // FacebookProvider({
    //   clientId: process.env.FACEBOOK_CLIENT_ID ?? "",
    //   clientSecret: process.env.FACEBOOK_CLIENT_SECRET ?? "",
    // }),

    EmailProvider({
      from: "Vilna <login@vilna.pro>",
      async sendVerificationRequest({ identifier, url }) {
        const resend = new Resend(process.env.RESEND_API_KEY ?? "");

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

  secret: process.env.NEXTAUTH_SECRET,
  pages: { signIn: "/auth" },

  // ключове: database sessions (прибирає Invalid Compact JWE і проблеми з email login)
  session: { strategy: "database" },

  callbacks: {
    // Для database-сесій token може бути undefined — тому не чіпаємо token тут.
    async session({ session }) {
      return session;
    },

    // Лишаємо мінімально (можна взагалі прибрати, але так безпечніше для гугла)
    async jwt({ token, account, profile }) {
      if (account && profile) {
        // @ts-ignore
        token.email = profile.email ?? token.email;
        // @ts-ignore
        token.name = profile.name ?? token.name;
        // @ts-ignore
        token.picture = profile.picture ?? token.picture;
      }
      return token;
    },
  },

  debug: process.env.NODE_ENV === "development",
};
