import NextAuth, { NextAuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import { PrismaAdapter } from "@next-auth/prisma-adapter"
import { prisma } from "@/src/server/db/client"

if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  throw new Error("Missing Google OAuth credentials")
}

if (!process.env.AUTH_SECRET) {
  throw new Error("Missing AUTH_SECRET")
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async jwt({ token, user, account }) {
      console.log('🔑 [AUTH] jwt callback:', {
        tokenEmail: token?.email || 'no-email',
        userId: user?.id || token?.sub || 'no-user-id',
        hasUser: !!user
      })
      
      if (user) {
        token.id = user.id
        console.log('✅ [AUTH] JWT updated with user ID:', user.id)
      }
      
      return token
    },
    async session({ session, token }) {
      console.log('📋 [AUTH] session callback:', {
        sessionUser: session?.user?.email || 'no-email',
        tokenId: token?.id || token?.sub || 'no-user-id',
        hasToken: !!token
      })
      
      if (session.user && token) {
        (session.user as any).id = token.id || token.sub
        console.log('✅ [AUTH] Session updated with user ID:', token.id || token.sub)
      } else {
        console.log('⚠️ [AUTH] Session or token missing')
      }
      
      return session
    },
    async redirect({ url, baseUrl }) {
      console.log('🔄 [AUTH] redirect callback:', { 
        url: url || 'no-url', 
        baseUrl 
      })
      
      // Always redirect to /chat after sign in
      const redirectUrl = `${baseUrl}/chat`
      console.log('✅ [AUTH] Redirecting to:', redirectUrl)
      return redirectUrl
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
  secret: process.env.AUTH_SECRET,
}

export default NextAuth(authOptions)

// Export getServerSession for use in API routes
export async function getServerSession() {
  const { getServerSession: getSession } = await import("next-auth/next")
  return getSession(authOptions)
}
