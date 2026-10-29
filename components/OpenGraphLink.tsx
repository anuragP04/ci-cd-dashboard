'use client'

import { useEffect } from 'react'

/**
 * The graph lives in a collapsed <details> near the bottom. A bare #hash would
 * scroll to it but leave it shut, so open it first, then scroll.
 */
export default function OpenGraphLink() {
  useEffect(() => {
    function open(e: Event) {
      const link = (e.target as HTMLElement)?.closest('[data-open-graph]')
      if (!link) return
      e.preventDefault()
      const panel = document.getElementById('branch-graph') as HTMLDetailsElement | null
      if (!panel) return
      panel.open = true
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' })
      history.replaceState(null, '', '#branch-graph')
    }
    document.addEventListener('click', open)

    // Arriving with #branch-graph already in the URL should open it too.
    if (window.location.hash === '#branch-graph') {
      const panel = document.getElementById('branch-graph') as HTMLDetailsElement | null
      if (panel) {
        panel.open = true
        requestAnimationFrame(() => panel.scrollIntoView({ block: 'start' }))
      }
    }
    return () => document.removeEventListener('click', open)
  }, [])

  return null
}
