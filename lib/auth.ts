/// <reference types="node" />

import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import EmailProvider from "next-auth/providers/email";
import CredentialsProvider from "next-auth/providers/credentials";

import { SupabaseAdapter } from "@auth/supabase-adapter";
import { Resend } from "resend";

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

const isDev = process.env.NODE_ENV === "development";

export const authOptions: NextAuthOptions = {
  useSecureCookies: true,

  // Adapter only in production (for database sessions)
  ...(isDev
    ? {}
    : {
        adapter: SupabaseAdapter({
          url: mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
          secret: mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
        }),
      }),

  providers: [
    // DEV ONLY: credentials provider
    ...(isDev
      ? [
          CredentialsProvider({
            id: "credentials",
            name: "Dev Login",
            credentials: {},
            async authorize() {
              return {
                id: "dev-user",
                email: "dev@vilna.pro",
                name: "Dev User",
              };
            },
          }),
        ]
      : []),

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
            </div>
          `,
        });
      },
    }),
  ],

  secret: mustEnv("NEXTAUTH_SECRET"),
  pages: { signIn: "/auth" },

  // JWT in dev, database in production
  session: {
    strategy: isDev ? "jwt" : "database",
  },

  callbacks: {
    async jwt({ token, user }) {
      // Store user id in token when user logs in
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token, user }) {
      // Add user id to session
      if (session.user) {
        // In database strategy, user object is available
        // In JWT strategy, we get it from token
        session.user.id = (user?.id || token?.id || token?.sub) as string;
      }
      return session;
    },
  },

  debug: isDev,
};
