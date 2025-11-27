import type { Metadata } from 'next'
import SessionProviderWrapper from '@/src/components/SessionProviderWrapper'
import './globals.css'

export const metadata: Metadata = {
  title: 'Personalized Therapeutic Chat',
  description: 'AI-powered therapeutic coaching chat application',
  robots: 'noindex, nofollow',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
  },
  other: {
    'google': 'notranslate',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="he" dir="rtl">
      <body suppressHydrationWarning>
        <SessionProviderWrapper>{children}</SessionProviderWrapper>
      </body>
    </html>
  )
}
