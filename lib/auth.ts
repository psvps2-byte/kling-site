/// <reference types="node" />

import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import EmailProvider from "next-auth/providers/email";
import CredentialsProvider from "next-auth/providers/credentials";

import { SupabaseAdapter } from "@auth/supabase-adapter";
import { Resend } from "resend";

function env(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v ? v : undefined;
}

const isDev = process.env.NODE_ENV !== "production";
const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL");
const supabaseServiceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
const googleClientId = env("GOOGLE_CLIENT_ID");
const googleClientSecret = env("GOOGLE_CLIENT_SECRET");
const nextAuthSecret = env("NEXTAUTH_SECRET");
const resendApiKey = env("RESEND_API_KEY");

const canUseAdapter = !isDev && !!supabaseUrl && !!supabaseServiceRoleKey;

export const authOptions: NextAuthOptions = {
  useSecureCookies: false,

  cookies: {
    sessionToken: {
      name: "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: false,
      },
    },
  },

  // Adapter only in production (for database sessions)
  ...(canUseAdapter
    ? {
        adapter: SupabaseAdapter({
          url: supabaseUrl!,
          secret: supabaseServiceRoleKey!,
        }),
      }
    : {}),

  providers: [
    // DEV ONLY: credentials provider with admin role
    ...(isDev
      ? [
          CredentialsProvider({
            id: "credentials",
            name: "Dev Login",
            credentials: {},
            async authorize() {
              return {
                id: "dev-admin",
                email: "dev@vilna.pro",
                name: "Dev Admin",
                role: "admin",
              };
            },
          }),
        ]
      : []),

    ...(googleClientId && googleClientSecret
      ? [
          GoogleProvider({
            clientId: googleClientId,
            clientSecret: googleClientSecret,
            authorization: { params: { prompt: "select_account" } },
          }),
        ]
      : []),

    // Email provider ONLY in production (requires adapter)
    ...(canUseAdapter
      ? [
          EmailProvider({
            from: "Vilna <login@vilna.pro>",
            async sendVerificationRequest({ identifier, url }) {
              if (!resendApiKey) throw new Error("Missing env: RESEND_API_KEY");
              const resend = new Resend(resendApiKey);

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
            </div>
          `,
              });
            },
          }),
        ]
      : []),
  ],

  ...(nextAuthSecret ? { secret: nextAuthSecret } : {}),
  pages: { signIn: "/auth" },

  // JWT in dev, database in production
  session: {
    strategy: isDev ? "jwt" : "database",
  },

  callbacks: {
    async jwt({ token, user }) {
      // Store user id and role in token when user logs in
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token, user }) {
      // Add user id and role to session
      if (session.user) {
        // In database strategy, user object is available
        // In JWT strategy, we get it from token
        session.user.id = (user?.id || token?.id || token?.sub) as string;
        session.user.role = (user?.role || token?.role) as string | undefined;
      }
      return session;
    },
  },

  debug: isDev,
};
