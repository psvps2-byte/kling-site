// lib/auth.ts
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import FacebookProvider from "next-auth/providers/facebook";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      authorization: { params: { prompt: "select_account" } },
    }),

    FacebookProvider({
      clientId: process.env.FACEBOOK_CLIENT_ID ?? "",
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET ?? "",
    }),
  ],

  secret: process.env.NEXTAUTH_SECRET,
  pages: { signIn: "/auth" },
  session: { strategy: "jwt" },

  callbacks: {
    async session({ session, token }) {
      if (session.user) {
        session.user.email = (token.email as string) ?? session.user.email;
        session.user.name = (token.name as string) ?? session.user.name;
        // @ts-ignore
        session.user.image = (token.picture as string) ?? session.user.image;
      }
      return session;
    },

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
};
