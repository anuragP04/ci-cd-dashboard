import type { ActiveRun } from '@/lib/types'

function elapsed(from: string): string {
  const s = Math.max(0, Math.floor((Date.now() - Date.parse(from)) / 1000))
  const m = Math.floor(s / 60)
  return m > 0 ? `${m}m${String(s % 60).padStart(2, '0')}s` : `${s}s`
}

export default function ActivityStrip({
  runs,
  idle,
}: {
  runs: ActiveRun[]
  idle: string[]
}) {
  const failed = runs.filter((r) => r.state === 'failure').length
  const active = runs.length - failed

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Right now</h2>
        <span className="count">
          {active} active{failed > 0 ? ` · ${failed} failed` : ''}
        </span>
      </div>

      {runs.length === 0 ? (
        <div className="idle">
          Nothing running. {idle.length} repos idle.
        </div>
      ) : (
        runs.map((r) => {
          const secs = Math.floor((Date.now() - Date.parse(r.startedAt)) / 1000)
          const pct =
            r.medianSeconds && r.state === 'running'
              ? Math.min(99, Math.round((secs / r.medianSeconds) * 100))
              : null
          const slow = r.medianSeconds !== null && secs > r.medianSeconds * 2

          return (
            <a className="run" key={r.url} href={r.url} target="_blank" rel="noreferrer">
              <span className="run-repo">
                <i className={`dot s-${r.state}`} />
                {r.repo}
              </span>
              <span className="run-title">{r.title}</span>
              <span className="run-meta">@{r.actor}</span>
              <span className="run-meta">{r.branch}</span>

              {r.state === 'running' && (
                <>
                  {pct !== null && (
                    <span className="bar">
                      <i style={{ width: `${pct}%` }} />
                    </span>
                  )}
                  <span className="run-meta">
                    {elapsed(r.startedAt)}
                    {slow ? ' · slow' : ''}
                  </span>
                </>
              )}
              {r.state === 'queued' && (
                <span className="run-meta">
                  queued {elapsed(r.startedAt)}
                  {secs > 300 ? ' · runner starvation' : ''}
                </span>
              )}
              {r.state === 'failure' && (
                <span className="run-meta">failed · {elapsed(r.startedAt)} ago</span>
              )}
            </a>
          )
        })
      )}
    </section>
  )
}
