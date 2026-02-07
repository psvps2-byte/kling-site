// app/api/auth/[...nextauth]/route.ts

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import NextAuth, { type NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import FacebookProvider from "next-auth/providers/facebook";
import EmailProvider from "next-auth/providers/email";

import { SupabaseAdapter } from "@auth/supabase-adapter";

/**
 * Жорстко перевіряємо env, щоб не було "вічного лоадінгу" через порожні ключі.
 */
function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export const authOptions: NextAuthOptions = {
  adapter: SupabaseAdapter({
    url: mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
    secret: mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
  }),

  providers: [
    GoogleProvider({
      clientId: mustEnv("GOOGLE_CLIENT_ID"),
      clientSecret: mustEnv("GOOGLE_CLIENT_SECRET"),
    }),

    // якщо Facebook не використовуєш — можеш прибрати провайдера і env
    FacebookProvider({
      clientId: mustEnv("FACEBOOK_CLIENT_ID"),
      clientSecret: mustEnv("FACEBOOK_CLIENT_SECRET"),
    }),

    EmailProvider({
      from: "Vilna <login@vilna.pro>",

      async sendVerificationRequest({ identifier, url }) {
        const { Resend } = await import("resend");
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

  // ЗАЛИШАЄМО JWT, але секрет має бути СТАБІЛЬНИЙ (один і той самий у Railway)
  session: { strategy: "jwt" },

  // критично: має бути завжди один і той самий, не міняти після деплоїв
  secret: mustEnv("NEXTAUTH_SECRET"),

  pages: {
    signIn: "/auth",
  },

  callbacks: {
    async jwt({ token, account, profile }) {
      // provider + access token
      if (account?.provider) (token as any).provider = account.provider;
      if (account?.access_token) (token as any).accessToken = account.access_token;

      // базові поля
      if (profile?.email && !token.email) token.email = profile.email;
      if ((profile as any)?.name && !token.name) token.name = (profile as any).name;

      return token;
    },

    async session({ session, token }) {
      // додаткові поля в session
      (session as any).provider = (token as any).provider;
      (session as any).accessToken = (token as any).accessToken;

      // інколи корисно мати user.id
      if (session.user) (session.user as any).id = token.sub;

      return session;
    },

    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      if (url.startsWith(baseUrl)) return url;
      return baseUrl;
    },
  },

  debug: process.env.NODE_ENV === "development",
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
