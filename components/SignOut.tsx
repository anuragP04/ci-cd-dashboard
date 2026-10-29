'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { COOKIE, STORAGE_KEY, validUntil } from '@/lib/auth'

function readCookie(): string | null {
  const hit = document.cookie.split('; ').find((c) => c.startsWith(`${COOKIE}=`))
  return hit ? hit.slice(COOKIE.length + 1) : null
}

export default function SignOut() {
  const router = useRouter()

  // The cookie can lapse while a tab sits open; notice it rather than letting
  // a stale board linger.
  useEffect(() => {
    const check = () => {
      if (!validUntil(readCookie())) router.refresh()
    }
    window.addEventListener('focus', check)
    const id = setInterval(check, 60_000)
    return () => {
      window.removeEventListener('focus', check)
      clearInterval(id)
    }
  }, [router])

  return (
    <button
      className="signout"
      onClick={() => {
        try {
          localStorage.removeItem(STORAGE_KEY)
        } catch {}
        document.cookie = `${COOKIE}=; path=/; max-age=0; SameSite=Lax`
        router.refresh()
      }}
      data-tip="Sign out of this browser"
    >
      Sign out
    </button>
  )
}
