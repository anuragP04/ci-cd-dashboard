import { notFound } from 'next/navigation'
import { getProject } from '@/lib/config'
import { getCachedRepoDetail } from '@/lib/data'
import PullRequestDetail from '@/components/PullRequestDetail'
import RefreshButton from '@/components/RefreshButton'

function ago(iso: string): string {
  if (!iso) return ''
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000)
  if (d === 0) return 'today'
  if (d === 1) return 'yesterday'
  return `${d}d ago`
}

export default async function RepoPage({
  params,
}: {
  params: Promise<{ project: string; repo: string }>
}) {
  const { project: key, repo: repoParam } = await params
  const project = getProject(key)
  if (!project) notFound()

  const name = decodeURIComponent(repoParam)
  const d = await getCachedRepoDetail(project, name)
  if (!d) notFound()

  return (
    <main className="wrap">
      <header className="head">
        <h1>
          <a href={`/${key}`} className="back">
            ← {project.name}
          </a>
        </h1>
        <span className="repo-title">
          {d.repo.name}
          <span className="kind">{d.repo.kind}</span>
        </span>
        <a className="tab" href={d.url} target="_blank" rel="noreferrer">
          GitHub ↗
        </a>
        <RefreshButton projectKey={key} fetchedAt={new Date().toISOString()} />
      </header>

      {d.warnings.length > 0 && (
        <div className="warn">
          <b>Problems</b>
          <ul>
            {d.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <PullRequestDetail
        open={d.pulls}
        closed={d.closedPulls}
        projectKey={key}
        repoName={d.repo.name}
      />

      {/* ---- pipeline ---- */}
      <section className="panel">
        <div className="panel-head">
          <h2>Pipeline</h2>
          <span className="count">trunk: {d.trunk}</span>
        </div>
        {d.rowError ? (
          <div className="idle" style={{ color: 'var(--red)' }}>
            {d.rowError}
          </div>
        ) : (
          <div className="pipe">
            {d.cells.map((c, i) => (
              <div className="pipe-step" key={c.env}>
                {i > 0 && (
                  <span className="pipe-arrow">
                    {c.ahead > 0 ? (
                      <span className={`ahead${c.ahead > 10 ? ' big' : ''}`}>↑{c.ahead}</span>
                    ) : (
                      '→'
                    )}
                  </span>
                )}
                <div className={`pipe-box${c.branch ? '' : ' muted'}`}>
                  <div className="pipe-env">{c.env}</div>
                  {c.branch ? (
                    <>
                      <div className="pipe-branch">{c.branch}</div>
                      <div className="sha">
                        <i className={`dot s-${c.state}`} />
                        {c.sha}
                      </div>
                    </>
                  ) : (
                    <div className="pipe-branch empty">not mapped</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ---- what is waiting at each hop ---- */}
      {d.hops.map((hop) => (
        <details className="panel acc" key={`${hop.from}-${hop.to}`}>
          <summary className="panel-head">
            <span className="chev" aria-hidden />
            <h2>
              {hop.from} → {hop.to}
            </h2>
            <span className="count">
              {hop.error
                ? 'comparison failed'
                : hop.ahead === 0
                  ? 'in sync'
                  : `${hop.ahead} waiting`}
            </span>
          </summary>

          {hop.error ? (
            <div className="idle" style={{ color: 'var(--red)' }}>
              {hop.error}
            </div>
          ) : hop.ahead === 0 ? (
            <div className="idle">
              Nothing waiting — <code>{hop.to}</code> has everything from{' '}
              <code>{hop.from}</code>.
            </div>
          ) : (
            <>
              <table>
                <thead>
                  <tr>
                    <th>Commit</th>
                    <th>Author</th>
                    <th>PR</th>
                    <th>Merged</th>
                  </tr>
                </thead>
                <tbody>
                  {hop.commits.map((c) => (
                    <tr key={c.sha}>
                      <td>
                        <a href={c.url} target="_blank" rel="noreferrer">
                          {c.message}
                        </a>
                      </td>
                      <td className="run-meta">@{c.author}</td>
                      <td className="num">{c.prNumber ? `#${c.prNumber}` : '—'}</td>
                      <td className="num">{ago(c.date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {hop.truncated && (
                <div className="idle">
                  Showing the most recent {hop.commits.length} of {hop.ahead}. GitHub
                  caps a comparison at 250 commits.
                </div>
              )}
            </>
          )}
        </details>
      ))}

      {/* ---- recent runs ---- */}
      <section className="panel">
        <div className="panel-head">
          <h2>Recent activity</h2>
          <span className="count">{d.runs.length}</span>
        </div>
        {d.runs.length === 0 ? (
          <div className="idle">No queued, running or recently failed runs.</div>
        ) : (
          d.runs.map((r) => (
            <a className="run" key={r.url} href={r.url} target="_blank" rel="noreferrer">
              <span className="run-repo">
                <i className={`dot s-${r.state}`} />
                {r.branch}
              </span>
              <span className="run-title">{r.title}</span>
              <span className="run-meta">@{r.actor}</span>
              <span className="run-meta">{ago(r.startedAt)}</span>
            </a>
          ))
        )}
      </section>
    </main>
  )
}
