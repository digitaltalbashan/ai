'use client'

import { signIn, useSession } from "next-auth/react"
import { useSearchParams, useRouter } from "next/navigation"
import { useEffect, useRef, useMemo } from "react"

export default function SignInPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { status } = useSession()
  const hasRedirected = useRef(false)

  const callbackUrl = useMemo(
    () => searchParams.get('callbackUrl') || '/chat',
    [searchParams]
  )

  console.log('🔐 [SIGNIN PAGE] Render:', {
    status,
    callbackUrl,
    hasRedirected: hasRedirected.current,
    pathname: typeof window !== 'undefined' ? window.location.pathname : 'server'
  })

  useEffect(() => {
    console.log('🔍 [SIGNIN PAGE] useEffect triggered:', {
      status,
      callbackUrl,
      hasRedirected: hasRedirected.current,
    })

    if (status === 'authenticated' && !hasRedirected.current) {
      console.log('✅ [SIGNIN PAGE] User authenticated, setting redirect flag')
      hasRedirected.current = true

      console.log('🚀 [SIGNIN PAGE] Executing redirect to:', callbackUrl)
      router.replace(callbackUrl)
    }
  }, [status, callbackUrl, router])

  if (status === 'loading' || status === 'authenticated') {
    console.log('⏳ [SIGNIN PAGE] Showing loading state, status:', status)
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50" dir="rtl">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto" />
          <p className="mt-4 text-gray-600">טוען...</p>
        </div>
      </div>
    )
  }

  console.log('📝 [SIGNIN PAGE] Rendering sign in form')

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50" dir="rtl">
      <div className="max-w-md w-full space-y-8 p-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">
            התחברות למערכת
          </h2>
          <p className="text-gray-600">
            התחבר עם חשבון Google שלך כדי להתחיל
          </p>
        </div>

        <button
          onClick={() => {
            console.log('🖱️ [SIGNIN PAGE] Sign in button clicked, callbackUrl:', callbackUrl)
            signIn('google', { callbackUrl })
          }}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-300 rounded-lg shadow-sm bg-white text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          <span className="font-medium">התחבר עם Google</span>
        </button>
      </div>
    </div>
  )
}
