import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Delivery Dashboard',
  description: 'Merge, build and deploy state across all repos',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
