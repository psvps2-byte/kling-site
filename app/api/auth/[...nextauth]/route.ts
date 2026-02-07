// app/api/auth/[...nextauth]/route.ts

import NextAuth, { type NextAuthOptions } from "next-auth";
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
    }),

    FacebookProvider({
      clientId: process.env.FACEBOOK_CLIENT_ID ?? "",
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET ?? "",
    }),

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

  // Можна лишати JWT, але тоді NEXTAUTH_SECRET має бути стабільним
  session: { strategy: "jwt" },

  secret: process.env.NEXTAUTH_SECRET,

  pages: {
    signIn: "/auth",
  },

  callbacks: {
    async jwt({ token, account, profile }) {
      if (account?.provider) token.provider = account.provider;
      if (account?.access_token) token.accessToken = account.access_token;

      if (profile?.email && !token.email) token.email = profile.email;
      if (profile?.name && !token.name) token.name = profile.name;

      return token;
    },

    async session({ session, token }) {
      (session as any).provider = (token as any).provider;
      (session as any).accessToken = (token as any).accessToken;
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
