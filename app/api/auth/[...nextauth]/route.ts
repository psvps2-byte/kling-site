// app/api/auth/[...nextauth]/route.ts

import NextAuth from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import FacebookProvider from "next-auth/providers/facebook"
import EmailProvider from "next-auth/providers/email"

import { SupabaseAdapter } from "@auth/supabase-adapter"
import { Resend } from "resend"

export const authOptions = {
  trustHost: true,

  adapter: SupabaseAdapter({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    secret: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  }),

  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),

    FacebookProvider({
      clientId: process.env.FACEBOOK_CLIENT_ID!,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET!,
    }),

    EmailProvider({
      from: "Vilna <login@vilna.pro>",
      async sendVerificationRequest({ identifier, url }) {
        const resend = new Resend(process.env.RESEND_API_KEY!)
        await resend.emails.send({
          from: "Vilna <login@vilna.pro>",
          to: identifier,
          subject: "Login to Vilna",
          html: `
            <h2>Login to Vilna</h2>
            <p><a href="${url}">Sign in</a></p>
          `,
        })
      },
    }),
  ],

  pages: {
    signIn: "/auth",
  },
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
