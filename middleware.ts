import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getToken } from "next-auth/jwt"

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  console.log('🔐 [MIDDLEWARE] Request:', {
    pathname,
    method: req.method,
    cookies: req.cookies.getAll().map(c => c.name)
  })

  // Always allow auth routes and root
  if (
    pathname.startsWith('/api/auth') || 
    pathname.startsWith('/auth') || 
    pathname === '/'
  ) {
    console.log('✅ [MIDDLEWARE] Allowing public route:', pathname)
    return NextResponse.next()
  }

  // Get token from cookie
  const token = await getToken({ 
    req, 
    secret: process.env.AUTH_SECRET 
  })

  console.log('🔍 [MIDDLEWARE] Token check:', {
    pathname,
    hasToken: !!token,
    tokenId: token?.sub || 'no-token'
  })

  // If no token, redirect to signin
  if (!token) {
    console.log('⚠️ [MIDDLEWARE] No token, redirecting to signin')
    const signInUrl = new URL('/auth/signin', req.url)
    signInUrl.searchParams.set('callbackUrl', pathname)
    console.log('🔄 [MIDDLEWARE] Redirect URL:', signInUrl.toString())
    return NextResponse.redirect(signInUrl)
  }

  console.log('✅ [MIDDLEWARE] Token exists, allowing access to:', pathname)
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
