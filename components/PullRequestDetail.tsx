import type { CheckState, PrCheck, PullRequest } from '@/lib/types'

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

/** PR list with each PR's individual checks, for the repo detail page. */
export default function PullRequestDetail({ pulls }: { pulls: PullRequest[] }) {
  const ready = pulls.filter((p) => p.status === 'READY').length

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Open pull requests</h2>
        <span className="count">
          {pulls.length} open · {ready} ready
        </span>
      </div>

      {pulls.length === 0 ? (
        <div className="idle">No open pull requests.</div>
      ) : (
        pulls.map((p) => {
          const failed = p.checks.filter((c) => c.state === 'failure').length
          const running = p.checks.filter((c) => c.state === 'pending').length

          return (
            <div className="pr" key={p.url}>
              <div className="pr-top">
                <span className="num">#{p.number}</span>
                <a href={p.url} target="_blank" rel="noreferrer" className="pr-title">
                  {p.title}
                </a>
                <span className="run-meta">@{p.author}</span>
                <span className="sha">→ {p.baseRef}</span>
                <span className={`num${p.ageDays >= 7 ? ' stale' : ''}`}>{p.ageDays}d</span>
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
                      {c.durationSeconds !== null && (
                        <em>{dur(c.durationSeconds)}</em>
                      )}
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
                  </span>
                </div>
              )}
            </div>
          )
        })
      )}
    </section>
  )
}
