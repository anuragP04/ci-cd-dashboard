import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import './globals.css'
import { COOKIE, validUntil } from '@/lib/auth'
import SignOut from '@/components/SignOut'

export const metadata: Metadata = {
  title: 'Delivery Dashboard',
  description: 'Merge, build and deploy state across all repos',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Middleware already turned away anyone without a valid cookie; this only
  // decides whether the sign-out affordance belongs on the page.
  const signedIn = validUntil((await cookies()).get(COOKIE)?.value) !== null

  return (
    <html lang="en">
      <body>
        {children}
        {signedIn && <SignOut />}
      </body>
    </html>
  )
}
