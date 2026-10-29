import type { EnvCell, ProjectConfig, RepoRow, RunState } from '@/lib/types'

const RUN_TIP: Record<RunState, string> = {
  success: 'Last Actions run on this branch passed',
  failure: 'Last Actions run on this branch failed',
  running: 'An Actions run is in progress',
  queued: 'An Actions run is queued',
  none: 'No Actions run found for this branch',
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

/** Explain the ↑N badge in the terms the cell actually measured. */
function aheadTip(cell: EnvCell): string {
  const base = `${plural(cell.ahead, 'commit')} in "${cell.comparedTo}" that ${
    cell.ahead === 1 ? 'has' : 'have'
  } not reached "${cell.branch}" yet`
  if (cell.oldestDays === null) return base
  const age =
    cell.oldestDays === 0
      ? 'the oldest was merged today'
      : `the oldest has been waiting ${plural(cell.oldestDays, 'day')}`
  return `${base} — ${age}`
}

function shaTip(cell: EnvCell, hasRun: boolean): string {
  const where = `"${cell.branch}" is at ${cell.sha}`
  const click = hasRun ? ' Click to open the run.' : ''

  // The trunk cell compares against itself, so "in sync with itself" would be
  // nonsense — say what it actually is instead.
  if (cell.comparedTo === cell.branch) {
    return `${where}. This is the trunk, where merges land first — nothing can be waiting to reach it.${click}`
  }
  if (cell.compareError) return `${where}.${click}`
  if (cell.ahead > 0) return `${where}.${click}`
  return cell.comparedTo
    ? `${where} — in sync with "${cell.comparedTo}", nothing waiting.${click}`
    : `${where}.${click}`
}

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
            {project.environments.map((e, i) => (
              <th
                key={e}
                data-tip={
                  i === 0
                    ? 'The trunk environment — where merges land first'
                    : `Compared against "${project.environments[i - 1]}"`
                }
              >
                {e}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name}>
              <td className="repo">
                <span data-tip={`Trunk: "${row.trunk}" — drift is measured from here`}>
                  {row.name}
                </span>
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
                      <span
                        className="empty"
                        data-tip={`No branch mapped to "${cell.env}" for this repo`}
                      >
                        —
                      </span>
                    ) : (
                      <>
                        <i className={`dot s-${cell.state}`} data-tip={RUN_TIP[cell.state]} />
                        {cell.runUrl ? (
                          <a
                            className="sha"
                            href={cell.runUrl}
                            target="_blank"
                            rel="noreferrer"
                            data-tip={shaTip(cell, true)}
                          >
                            {cell.sha}
                          </a>
                        ) : (
                          <span className="sha" data-tip={shaTip(cell, false)}>
                            {cell.sha}
                          </span>
                        )}

                        {cell.compareError && (
                          <span
                            className="ahead big"
                            data-tip={`Could not compare against "${cell.comparedTo}": ${cell.compareError}. This is not "in sync" — the number is unknown.`}
                          >
                            ?
                          </span>
                        )}

                        {!cell.compareError && cell.ahead > 0 && (
                          <span
                            className={`ahead${cell.ahead > 10 ? ' big' : ''}`}
                            data-tip={aheadTip(cell)}
                          >
                            ↑{cell.ahead}
                          </span>
                        )}

                        {!cell.compareError &&
                          cell.oldestDays !== null &&
                          cell.oldestDays >= 7 && (
                            <span
                              className="age"
                              data-tip={`The oldest commit still waiting to reach "${cell.branch}" was merged ${plural(
                                cell.oldestDays,
                                'day',
                              )} ago`}
                            >
                              {cell.oldestDays}d
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
