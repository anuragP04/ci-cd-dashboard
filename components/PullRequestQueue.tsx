import type { PullRequest } from '@/lib/types'

const STALE_DAYS = 7

export default function PullRequestQueue({ pulls }: { pulls: PullRequest[] }) {
  const ready = pulls.filter((p) => p.status === 'READY').length
  const stuck = pulls.filter(
    (p) => p.status === 'CONFLICTS' || p.status === 'BLOCKED' || p.status === 'CI FAILED',
  ).length

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Open pull requests</h2>
        <span className="count">
          {pulls.length} open · {ready} ready · {stuck} stuck
        </span>
      </div>

      {pulls.length === 0 ? (
        <div className="idle">No open pull requests.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Repo</th>
              <th>PR</th>
              <th>Author</th>
              <th>Base</th>
              <th>Age</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {pulls.map((p) => (
              <tr key={p.url}>
                <td className="repo">{p.repo}</td>
                <td>
                  <span className="num">#{p.number}</span>{' '}
                  <a href={p.url} target="_blank" rel="noreferrer">
                    {p.title}
                  </a>
                </td>
                <td className="run-meta">@{p.author}</td>
                <td className="sha">{p.baseRef}</td>
                <td className={`num${p.ageDays >= STALE_DAYS ? ' stale' : ''}`}>
                  {p.ageDays}d
                </td>
                <td>
                  <span className={`pill p-${p.status.replace(/\s/g, '')}`}>{p.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
