'use client'

import { useEffect, useState } from 'react'
import { fetchCheckDetail } from '@/lib/actions'
import type { CheckState, PrCheck, PullRequest, ResolvedCheck } from '@/lib/types'

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

function clock(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const STATE_LABEL: Record<CheckState, string> = {
  success: 'Passed',
  failure: 'Failed',
  pending: 'Running',
  skipped: 'Skipped',
  cancelled: 'Cancelled',
  neutral: 'Neutral',
}

function Row({
  p,
  closed,
  isOpen,
  onToggle,
  projectKey,
  repoName,
}: {
  p: PullRequest
  closed: boolean
  isOpen: boolean
  onToggle: () => void
  projectKey: string
  repoName: string
}) {
  const [resolved, setResolved] = useState<ResolvedCheck[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Commit statuses carry no timing of their own, so on expand we follow each
  // one to the workflow run behind it — often in another repo.
  useEffect(() => {
    if (!isOpen || resolved !== null || loading) return
    setLoading(true)
    fetchCheckDetail(projectKey, repoName, p.number)
      .then((r) => {
        setResolved(r.checks)
        setErr(r.error)
      })
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false))
  }, [isOpen, resolved, loading, projectKey, repoName, p.number])

  /** GraphQL rows, upgraded wherever the status trail gave us something better. */
  const rows: ResolvedCheck[] = p.checks.map((c) => {
    const hit = resolved?.find((r) => r.name === c.name)
    if (hit && (hit.source === 'run' || c.durationSeconds === null)) return hit
    return {
      name: c.name,
      state: c.state,
      description: null,
      startedAt: c.startedAt,
      completedAt: c.completedAt,
      durationSeconds: c.durationSeconds,
      url: c.url,
      workflow: c.workflow,
      foreignRepo: null,
      jobs: [],
      source: c.durationSeconds === null ? 'none' : 'run',
    }
  })
  const failed = p.checks.filter((c) => c.state === 'failure').length
  const running = p.checks.filter((c) => c.state === 'pending').length
  const passed = p.checks.filter((c) => c.state === 'success').length



  const total = rows.reduce((n, c) => n + (c.durationSeconds ?? 0), 0)

  return (
    <div className={`pr${isOpen ? ' pr-open' : ''}`} id={`pr-${p.number}`}>
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
        <button
          className={`detail-btn${isOpen ? ' on' : ''}`}
          onClick={onToggle}
          aria-expanded={isOpen}
          data-tip={
            p.checks.length === 0
              ? 'No checks to show'
              : `${isOpen ? 'Hide' : 'Show'} all ${p.checks.length} checks with timings`
          }
          disabled={p.checks.length === 0}
        >
          Details
        </button>
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

      {isOpen && p.checks.length > 0 && (
        <div className="chk-detail">
          <div className="chk-detail-head">
            <span>
              {rows.length} checks
              {total > 0 && ` · ${dur(total)} total`}
              {loading && (
                <>
                  {' · '}
                  <span className="spinner" />
                  resolving run timings
                </>
              )}
              {err && ` · ${err}`}
            </span>
            <a href={p.url} target="_blank" rel="noreferrer" className="subtab">
              Open PR ↗
            </a>
            <CopyLink number={p.number} />
          </div>
          <table>
            <thead>
              <tr>
                <th>Check</th>
                <th>Workflow</th>
                <th>Status</th>
                <th>Started</th>
                <th>Finished</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.name}>
                  <td>
                    {c.url ? (
                      <a href={c.url} target="_blank" rel="noreferrer">
                        {c.name}
                      </a>
                    ) : (
                      c.name
                    )}
                    {c.description && <div className="chk-desc">{c.description}</div>}
                    {c.jobs.length > 0 && (
                      <div className="chk-jobs">
                        {c.jobs.map((j) => (
                          <span key={j.name} className="chk-job">
                            {j.name}
                            {j.durationSeconds !== null && ` ${dur(j.durationSeconds)}`}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="sha">
                    {loading && c.workflow === null ? (
                      <span className="shim w-md" />
                    ) : (
                      (c.workflow ?? '—')
                    )}
                    {c.foreignRepo && (
                      <div
                        className="chk-foreign"
                        data-tip={`This check is produced by a workflow in ${c.foreignRepo}, a different repo`}
                      >
                        ↗ {c.foreignRepo.split('/')[1]}
                      </div>
                    )}
                  </td>
                  <td>
                    <span className={`chk c-${c.state} chk-flat`}>
                      <b>{MARK[c.state]}</b> {STATE_LABEL[c.state]}
                    </span>
                  </td>
                  <td className="num">
                    {loading && c.source === 'none' ? (
                      <span className="shim w-md" />
                    ) : (
                      clock(c.startedAt)
                    )}
                  </td>
                  <td className="num">
                    {loading && c.source === 'none' ? (
                      <span className="shim w-md" />
                    ) : (
                      clock(c.completedAt)
                    )}
                  </td>
                  <td className="num">
                    {c.durationSeconds === null ? (
                      loading ? <span className="shim w-sm" /> : '—'
                    ) : (
                      <>
                        {dur(c.durationSeconds)}
                        {c.source === 'statusspan' && (
                          <span
                            className="approx"
                            data-tip="GitHub records no duration for this check. This is the gap between its first pending status and its final one, so it includes queue time."
                          >
                            ~
                          </span>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/** Copies a deep link to this PR's expanded checks. */
function CopyLink({ number }: { number: number }) {
  const [done, setDone] = useState(false)

  return (
    <button
      className="subtab"
      onClick={() => {
        const url = `${window.location.origin}${window.location.pathname}#pr-${number}`
        navigator.clipboard?.writeText(url).then(
          () => {
            setDone(true)
            setTimeout(() => setDone(false), 1600)
          },
          () => setDone(false),
        )
      }}
      data-tip="Copy a link that opens this PR's checks already expanded"
    >
      {done ? 'Copied ✓' : 'Copy link'}
    </button>
  )
}

export default function PullRequestDetail({
  open = [],
  closed = [],
  projectKey,
  repoName,
}: {
  open?: PullRequest[]
  closed?: PullRequest[]
  projectKey: string
  repoName: string
}) {
  const [tab, setTab] = useState<'open' | 'closed'>('open')
  // One expanded PR at a time, across both tabs.
  const [expanded, setExpanded] = useState<number | null>(null)
  // One counter per tab so switching back does not collapse what you expanded.
  const [shown, setShown] = useState<{ open: number; closed: number }>({
    open: PAGE,
    closed: PAGE,
  })

  // A #pr-123 hash opens that PR's checks on load, which is what makes the
  // Copy link button useful: the recipient lands on the expanded view.
  useEffect(() => {
    const fromHash = () => {
      const m = window.location.hash.match(/^#pr-(\d+)$/)
      if (!m) return
      const n = Number(m[1])
      setExpanded(n)
      if (closed.some((p) => p.number === n) && !open.some((p) => p.number === n)) {
        setTab('closed')
      }
      requestAnimationFrame(() =>
        document.getElementById(`pr-${n}`)?.scrollIntoView({ block: 'center' }),
      )
    }
    fromHash()
    window.addEventListener('hashchange', fromHash)
    return () => window.removeEventListener('hashchange', fromHash)
  }, [open, closed])

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
            <Row
              key={p.url}
              p={p}
              closed={tab === 'closed'}
              projectKey={projectKey}
              repoName={repoName}
              isOpen={expanded === p.number}
              onToggle={() => {
                const next = expanded === p.number ? null : p.number
                setExpanded(next)
                // Keep the URL in step so the view stays shareable.
                history.replaceState(
                  null,
                  '',
                  next === null
                    ? window.location.pathname
                    : `${window.location.pathname}#pr-${next}`,
                )
              }}
            />
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
