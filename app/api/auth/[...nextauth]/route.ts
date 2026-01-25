// app/api/auth/[...nextauth]/route.ts
import NextAuth, { type NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import FacebookProvider from "next-auth/providers/facebook";

/**
 * Важливо:
 * - НЕ додаємо EmailProvider, бо без DB adapter буде 500 (EMAIL_REQUIRES_ADAPTER_ERROR)
 * - NEXTAUTH_URL має бути http://localhost:3000 (або твій домен/нгрок)
 * - NEXTAUTH_SECRET обовʼязково
 * - GOOGLE_CLIENT_ID/SECRET + FACEBOOK_CLIENT_ID/SECRET обовʼязково
 */

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      // За бажанням: можна вимагати завжди consent
      // authorization: { params: { prompt: "consent", access_type: "offline", response_type: "code" } },
    }),

    FacebookProvider({
      clientId: process.env.FACEBOOK_CLIENT_ID ?? "",
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET ?? "",
    }),
  ],

  // Без бази — використовуємо JWT
  session: { strategy: "jwt" },

  // Рекомендовано явно задавати
  secret: process.env.NEXTAUTH_SECRET,

  // Сторінка логіну (твій /auth)
  pages: {
    signIn: "/auth",
    // error: "/auth", // можеш розкоментити, якщо хочеш показувати помилки на /auth
  },

  callbacks: {
    async jwt({ token, account, profile }) {
      // можна зберегти provider + access_token (якщо треба)
      if (account?.provider) token.provider = account.provider;
      if (account?.access_token) token.accessToken = account.access_token;

      // інколи корисно мати email/name з профайла
      if (profile?.email && !token.email) token.email = profile.email;
      if (profile?.name && !token.name) token.name = profile.name;

      return token;
    },

    async session({ session, token }) {
      // Прокидуємо provider та accessToken у session (за потреби)
      (session as any).provider = token.provider;
      (session as any).accessToken = token.accessToken;

      return session;
    },

    async redirect({ url, baseUrl }) {
      // Безпечний redirect: тільки в межах сайту
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      if (url.startsWith(baseUrl)) return url;
      return baseUrl;
    },
  },

  // Для дебагу (можеш вимкнути потім)
  debug: process.env.NODE_ENV === "development",
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
