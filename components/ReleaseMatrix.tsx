import type { ProjectConfig, RepoRow } from '@/lib/types'

export default function ReleaseMatrix({
  project,
  rows,
}: {
  project: ProjectConfig
  rows: RepoRow[]
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Release matrix</h2>
        <span className="count">{rows.length} repos</span>
      </div>

      <table>
        <thead>
          <tr>
            <th>Repo</th>
            {project.environments.map((e) => (
              <th key={e}>{e}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <td className="repo">
                {row.name}
                <span className="kind">{row.kind}</span>
              </td>

              {row.error ? (
                <td colSpan={project.environments.length} className="empty">
                  {row.error}
                </td>
              ) : (
                row.cells.map((cell) => (
                  <td key={cell.env}>
                    {cell.error ? (
                      <span style={{ color: 'var(--red)' }}>{cell.error}</span>
                    ) : !cell.sha ? (
                      <span className="empty">—</span>
                    ) : (
                      <>
                        <i className={`dot s-${cell.state}`} />
                        {cell.runUrl ? (
                          <a className="sha" href={cell.runUrl} target="_blank" rel="noreferrer">
                            {cell.sha}
                          </a>
                        ) : (
                          <span className="sha">{cell.sha}</span>
                        )}
                        {cell.ahead > 0 && (
                          <span className={`ahead${cell.ahead > 10 ? ' big' : ''}`}>
                            ↑{cell.ahead}
                          </span>
                        )}
                      </>
                    )}
                  </td>
                ))
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
