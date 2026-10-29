'use client'

import { useState } from 'react'
import type { CheckState, PrCheck, PullRequest } from '@/lib/types'

const PAGE = 20

const MARK: Record<CheckState, string> = {
  success: '✓',
  failure: '✕',
  pending: '◴',
  skipped: '–',
  cancelled: '⊘',
  neutral: '·',
}

function dur(seconds: number | null): string {
  if (seconds === null) return ''
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, '0')}s`
}

function ago(iso: string | null): string {
  if (!iso) return ''
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000)
  if (d === 0) return 'today'
  if (d === 1) return 'yesterday'
  return `${d}d ago`
}

function tip(c: PrCheck): string {
  const where = c.workflow ? ` in workflow "${c.workflow}"` : ''
  const took = c.durationSeconds !== null ? `, took ${dur(c.durationSeconds)}` : ''
  const verb: Record<CheckState, string> = {
    success: 'passed',
    failure: 'failed',
    pending: 'is still running',
    skipped: 'was skipped',
    cancelled: 'was cancelled',
    neutral: 'finished without a verdict',
  }
  return `"${c.name}"${where} ${verb[c.state]}${took}`
}

function Row({ p, closed }: { p: PullRequest; closed: boolean }) {
  const failed = p.checks.filter((c) => c.state === 'failure').length
  const running = p.checks.filter((c) => c.state === 'pending').length
  const passed = p.checks.filter((c) => c.state === 'success').length

  return (
    <div className="pr">
      <div className="pr-top">
        <span className="num">#{p.number}</span>
        <a href={p.url} target="_blank" rel="noreferrer" className="pr-title">
          {p.title}
        </a>
        <span className="run-meta">@{p.author}</span>
        <span className="sha">→ {p.baseRef}</span>
        <span className={`num${!closed && p.ageDays >= 7 ? ' stale' : ''}`}>
          {closed ? ago(p.endedAt) : `${p.ageDays}d`}
        </span>
        <span className={`pill p-${p.status.replace(/\s/g, '')}`}>{p.status}</span>
      </div>

      {p.checks.length === 0 ? (
        <div className="pr-checks empty-checks">
          No checks reported on this PR&apos;s head commit
        </div>
      ) : (
          <div className="pr-checks">
            {p.checks.map((c) => (
              <a
                key={c.name + c.url}
                className={`chk c-${c.state}`}
                href={c.url ?? p.url}
                target="_blank"
                rel="noreferrer"
                data-tip={tip(c)}
              >
                <b>{MARK[c.state]}</b> {c.name}
                {c.durationSeconds !== null && <em>{dur(c.durationSeconds)}</em>}
              </a>
            ))}
            {p.checksTotal > p.checks.length && (
              <span className="chk c-neutral">
                +{p.checksTotal - p.checks.length} more
              </span>
            )}
          <span className="chk-summary">
            {failed > 0 && <b className="bad">{failed} failed</b>}
            {failed > 0 && running > 0 && ' · '}
            {running > 0 && <b className="warn-t">{running} running</b>}
            {failed === 0 && running === 0 && passed > 0 && (
              <b className="ok-t">all {passed} passed</b>
            )}
          </span>
        </div>
      )}
    </div>
  )
}

export default function PullRequestDetail({
  open = [],
  closed = [],
}: {
  open?: PullRequest[]
  closed?: PullRequest[]
}) {
  const [tab, setTab] = useState<'open' | 'closed'>('open')
  // One counter per tab so switching back does not collapse what you expanded.
  const [shown, setShown] = useState<{ open: number; closed: number }>({
    open: PAGE,
    closed: PAGE,
  })

  const list = tab === 'open' ? open : closed
  const visible = shown[tab]
  const remaining = list.length - visible

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Pull requests</h2>
        <div className="subtabs">
          <button
            className={`subtab${tab === 'open' ? ' on' : ''}`}
            onClick={() => setTab('open')}
          >
            Open <span className="num">{open.length}</span>
          </button>
          <button
            className={`subtab${tab === 'closed' ? ' on' : ''}`}
            onClick={() => setTab('closed')}
          >
            Closed <span className="num">{closed.length}</span>
          </button>
        </div>
        <span className="count">
          newest first
          {list.length > 0 && ` · showing ${Math.min(visible, list.length)} of ${list.length}`}
        </span>
      </div>

      {list.length === 0 ? (
        <div className="idle">No {tab} pull requests.</div>
      ) : (
        <>
          {list.slice(0, visible).map((p) => (
            <Row key={p.url} p={p} closed={tab === 'closed'} />
          ))}

          {remaining > 0 && (
            <div className="more">
              <button
                className="tab"
                onClick={() =>
                  setShown((s) => ({ ...s, [tab]: s[tab] + PAGE }))
                }
              >
                Load {Math.min(PAGE, remaining)} more
                <span className="num"> · {remaining} left</span>
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}
