'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function Home() {
  const { status } = useSession()
  const router = useRouter()

  console.log('🏠 [HOME PAGE] Render:', { status })

  useEffect(() => {
    console.log('🔍 [HOME PAGE] useEffect triggered:', { status })
    
    if (status === 'authenticated') {
      console.log('✅ [HOME PAGE] User authenticated, redirecting to /chat')
      router.replace('/chat')
    } else if (status === 'unauthenticated') {
      console.log('⚠️ [HOME PAGE] User not authenticated, redirecting to /auth/signin')
      router.replace('/auth/signin')
    }
  }, [status, router])

  console.log('⏳ [HOME PAGE] Showing loading state')
  return (
    <main className="flex min-h-screen flex-col items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
        <p className="mt-4 text-gray-600">טוען...</p>
      </div>
    </main>
  )
}
