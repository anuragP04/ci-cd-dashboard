import type { PromotionPair } from '@/lib/types'

const STALE_DAYS = 7

export default function PromotionView({ pairs }: { pairs: PromotionPair[] }) {
  const pending = pairs.filter((p) => p.ahead > 0)

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Branch promotion</h2>
        <span className="count">
          {pending.length} of {pairs.length} hops behind
        </span>
      </div>

      {pairs.length === 0 ? (
        <div className="idle">
          No multi-branch flows configured. Add two or more environments to a repo
          to see promotion state.
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Repo</th>
              <th>Hop</th>
              <th>Behind by</th>
              <th>Oldest</th>
            </tr>
          </thead>
          <tbody>
            {pairs.map((p) => (
              <tr key={`${p.repo}-${p.from}-${p.to}`}>
                <td className="repo">{p.repo}</td>
                <td className="sha">
                  {p.from} <span className="empty">→</span> {p.to}
                </td>
                <td>
                  {p.error ? (
                    <span style={{ color: 'var(--red)' }}>{p.error}</span>
                  ) : p.ahead === 0 ? (
                    <span className="empty">in sync</span>
                  ) : (
                    <span className={`ahead${p.ahead > 10 ? ' big' : ''}`}>
                      ↑{p.ahead}
                    </span>
                  )}
                </td>
                <td
                  className={`num${
                    p.oldestDays !== null && p.oldestDays >= STALE_DAYS ? ' stale' : ''
                  }`}
                >
                  {p.oldestDays === null ? '—' : `${p.oldestDays}d`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
