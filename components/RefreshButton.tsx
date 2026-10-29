'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { refreshProject } from '@/lib/actions'

/**
 * Two different refreshes, deliberately:
 *
 * - The button forces a refetch from GitHub by expiring the cache tag.
 * - The interval only re-renders, which keeps elapsed timers moving without
 *   spending API calls. Cached data is at most 60s old anyway.
 */
export default function RefreshButton({
  projectKey,
  fetchedAt,
  intervalSeconds = 20,
}: {
  projectKey: string
  fetchedAt: string
  intervalSeconds?: number
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [now, setNow] = useState(() => Date.now())

  const hardRefresh = () =>
    startTransition(async () => {
      await refreshProject(projectKey)
      router.refresh()
    })

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000)
    const soft = setInterval(() => router.refresh(), intervalSeconds * 1000)
    return () => {
      clearInterval(tick)
      clearInterval(soft)
    }
  }, [router, intervalSeconds])

  const age = Math.max(0, Math.floor((now - Date.parse(fetchedAt)) / 1000))
  const label = age < 60 ? `${age}s ago` : `${Math.floor(age / 60)}m ago`

  return (
    <span className="refresh">
      <span className="stamp">
        {pending ? (
          <>
            <span className="spinner" />
            refreshing
          </>
        ) : (
          `updated ${label}`
        )}
      </span>
      <button
        className="tab"
        onClick={hardRefresh}
        disabled={pending}
        title="Refetch from GitHub now"
      >
        <span className={pending ? 'spin' : undefined}>⟳</span> Refresh
      </button>
    </span>
  )
}
