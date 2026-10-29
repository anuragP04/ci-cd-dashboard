'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { COOKIE, DAY_MS, PASSWORD, STORAGE_KEY } from '@/lib/auth'

export default function LoginForm() {
  const router = useRouter()
  const [value, setValue] = useState('')
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (value !== PASSWORD) {
      setError(true)
      setValue('')
      return
    }

    const expires = Date.now() + DAY_MS
    // localStorage is the record you asked for; the cookie is what lets the
    // server skip rendering the dashboard at all when nobody is signed in.
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ expires }))
    } catch {}
    document.cookie = `${COOKIE}=${expires}; path=/; max-age=${DAY_MS / 1000}; SameSite=Lax`

    setBusy(true)
    router.refresh()
  }

  return (
    <main className="gate">
      <form className="gate-card" onSubmit={submit}>
        <h1>Delivery</h1>
        <p>Enter the password to view the dashboard.</p>
        <input
          type="password"
          value={value}
          autoFocus
          placeholder="Password"
          aria-label="Password"
          aria-invalid={error}
          className={error ? 'bad' : undefined}
          onChange={(e) => {
            setValue(e.target.value)
            if (error) setError(false)
          }}
        />
        {error && <span className="gate-err">That password is not right.</span>}
        <button type="submit" disabled={value.length === 0 || busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <span className="gate-note">Stays signed in on this browser for 24 hours.</span>
      </form>
    </main>
  )
}
