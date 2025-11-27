'use client'

import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

export default function AuthErrorPage() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')

  const errorMessages: Record<string, string> = {
    Configuration: 'יש בעיה בהגדרת האימות. אנא פנה למנהל המערכת.',
    AccessDenied: 'הגישה נדחתה. אנא נסה שוב.',
    Verification: 'בעיה באימות. נסה שוב.',
    Default: 'אירעה שגיאה בהתחברות. אנא נסה שוב.',
  }

  const errorMessage = errorMessages[error || ''] || errorMessages.Default

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50" dir="rtl">
      <div className="max-w-md w-full space-y-8 p-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-red-600 mb-2">
            שגיאה בהתחברות
          </h2>
          <p className="text-gray-600 mb-6">
            {errorMessage}
          </p>
          {error && (
            <p className="text-sm text-gray-500 mb-6">
              קוד שגיאה: {error}
            </p>
          )}
          <Link
            href="/auth/signin"
            className="inline-block px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            נסה שוב
          </Link>
        </div>
      </div>
    </div>
  )
}

