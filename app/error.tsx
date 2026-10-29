'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main className="wrap">
      <header className="head">
        <h1>Delivery</h1>
      </header>
      <div className="warn">
        <b>Dashboard failed to load</b>
        <p style={{ margin: '0 0 12px', color: 'var(--muted)' }}>{error.message}</p>
        <button className="tab" onClick={reset} style={{ cursor: 'pointer' }}>
          Retry
        </button>
      </div>
    </main>
  )
}
