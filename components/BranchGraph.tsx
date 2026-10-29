'use client'

import { useState } from 'react'
import { fetchBranchGraph } from '@/lib/actions'
import type { BranchGraph as Graph, GraphCommit, GraphLane } from '@/lib/graph'

const PAGE = 25

// The curve overlay is positioned arithmetically, so these must match the CSS
// exactly: .gg-row height, .gg-cell width, and .gg-row horizontal padding.
const ROW_H = 28
const LANE_W = 18
const PAD_L = 14

interface Link {
  key: string
  x1: number
  y1: number
  x2: number
  y2: number
  lane: number
}

/**
 * One curve per merge, from the merge commit to its second parent — the tip of
 * the branch it absorbed. That second parent is what the lane dots cannot
 * show: dots say where a commit ended up, the curve says where it came from.
 *
 * Only merges whose parent is on screen are drawn; a curve to a row that is
 * not rendered would have nowhere to land.
 */
function buildLinks(rows: GraphCommit[], lanes: GraphLane[]): Link[] {
  const rowOf = new Map(rows.map((c, i) => [c.sha, i]))
  const laneOf = (c: GraphCommit) =>
    lanes.findIndex((l) => l.branch === c.inBranches[0])
  const centre = (lane: number) => PAD_L + lane * LANE_W + LANE_W / 2
  const middle = (row: number) => row * ROW_H + ROW_H / 2

  const links: Link[] = []

  rows.forEach((c, i) => {
    if (!c.isMerge || c.parents.length < 2) return
    const parentSha = c.parents[1]
    const j = rowOf.get(parentSha)
    if (j === undefined) return

    const from = laneOf(c)
    const to = laneOf(rows[j])
    // Same lane means the absorbed branch is not one we draw (a feature
    // branch); the rail already covers that case.
    if (from < 0 || to < 0 || from === to) return

    links.push({
      key: `${c.sha}-${parentSha}`,
      x1: centre(from),
      y1: middle(i),
      x2: centre(to),
      y2: middle(j),
      lane: to,
    })
  })

  return links
}

const LANE_COLOURS = ['#58a6ff', '#3fb950', '#d29922', '#bc8cff', '#f778ba', '#56d4dd']

function when(iso: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function ago(iso: string): string {
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000)
  if (d === 0) return 'today'
  if (d === 1) return 'yesterday'
  return `${d}d`
}

/** The lane cells for one commit row: a vertical rail per branch, dot where present. */
function Rails({
  lanes,
  commit,
  first,
  last,
}: {
  lanes: GraphLane[]
  commit: GraphCommit
  first: boolean
  last: boolean
}) {
  return (
    <span className="gg-rails">
      {lanes.map((lane, i) => {
        const has = commit.inBranches.includes(lane.branch)
        return (
          <span className="gg-cell" key={lane.branch} style={{ ['--lane' as string]: i }}>
            <i className={`gg-rail${first ? ' rail-first' : ''}${last ? ' rail-last' : ''}`} />
            {has && <i className={`gg-node${commit.isMerge ? ' is-merge' : ''}`} />}
          </span>
        )
      })}
    </span>
  )
}

export default function BranchGraph({
  projectKey,
  repoName,
  branches,
  envByBranch,
  repoUrl,
}: {
  projectKey: string
  repoName: string
  branches: string[]
  envByBranch: Record<string, string>
  repoUrl: string
}) {
  const [graph, setGraph] = useState<Graph | null>(null)
  const [loading, setLoading] = useState(false)
  const [picked, setPicked] = useState<GraphCommit | null>(null)
  const [shown, setShown] = useState(PAGE)

  function load() {
    if (graph || loading) return
    setLoading(true)
    fetchBranchGraph(projectKey, repoName, branches, envByBranch)
      .then(setGraph)
      .finally(() => setLoading(false))
  }

  const lanes = graph?.lanes ?? []
  const rows = (graph?.commits ?? []).slice(0, shown)
  const remaining = (graph?.commits.length ?? 0) - rows.length

  return (
    <details className="panel acc" id="branch-graph" onToggle={(e) => e.currentTarget.open && load()}>
      <summary className="panel-head">
        <span className="chev" aria-hidden />
        <h2>Branch graph</h2>
        <span className="count">
          {loading
            ? 'loading…'
            : graph
              ? `${graph.commits.length} commits · ${lanes.length} branches`
              : `${branches.length} configured branches`}
        </span>
      </summary>

      {loading && (
        <div className="skel">
          {[0, 1, 2, 3, 4].map((i) => (
            <div className="skel-line" key={i}>
              <span className="shim row w-sm" />
              <span className="shim row w-lg" />
            </div>
          ))}
        </div>
      )}

      {graph?.error && (
        <div className="idle" style={{ color: 'var(--red)' }}>
          {graph.error}
        </div>
      )}

      {graph && !graph.error && rows.length > 0 && (
        <>
          {/* lane key, aligned with the rails below */}
          <div className="gg-head">
            <span className="gg-rails">
              {lanes.map((lane, i) => (
                <span className="gg-cell" key={lane.branch} style={{ ['--lane' as string]: i }}>
                  <i className={`gg-node lane-${i % 6}`} />
                </span>
              ))}
            </span>
            <span className="gg-legend">
              {lanes.map((lane, i) => (
                <span className="gg-key" key={lane.branch}>
                  <i className={`gg-swatch lane-${i % 6}`} />
                  <b>{lane.branch}</b>
                  {lane.env && <em>{lane.env}</em>}
                  {lane.detached && (
                    <span
                      className="gl-detached"
                      data-tip={`"${lane.branch}" shares no commits with the lane before it — unrelated history, so work cannot simply flow between them.`}
                    >
                      detached
                    </span>
                  )}
                </span>
              ))}
            </span>
          </div>

          <div className="gg-rows" style={{ height: rows.length * ROW_H }}>
            <svg
              className="gg-links"
              width="100%"
              height={rows.length * ROW_H}
              aria-hidden
            >
              {buildLinks(rows, lanes).map((l) => {
                // Vertical-tangent bezier: leaves the merge downward, arrives
                // at the parent from above, so it reads as flow not a diagonal.
                const dy = Math.max(10, Math.min(22, (l.y2 - l.y1) / 2))
                return (
                  <path
                    key={l.key}
                    d={`M ${l.x1} ${l.y1} C ${l.x1} ${l.y1 + dy}, ${l.x2} ${l.y2 - dy}, ${l.x2} ${l.y2}`}
                    fill="none"
                    stroke={LANE_COLOURS[l.lane % LANE_COLOURS.length]}
                    strokeWidth="2"
                    strokeLinecap="round"
                    opacity="0.55"
                  />
                )
              })}
            </svg>
            {rows.map((c, idx) => (
              <button
                key={c.sha}
                className={`gg-row${picked?.sha === c.sha ? ' on' : ''}`}
                onClick={() => setPicked(picked?.sha === c.sha ? null : c)}
                data-tip={`${c.short} · ${c.subject}
@${c.author} · ${when(c.date)}${
                  c.isMerge && c.mergeFrom && c.inBranches[0] && c.mergeFrom !== c.inBranches[0]
                    ? `\nmerged "${c.mergeFrom}" into "${c.inBranches[0]}"`
                    : ''
                }
in: ${c.inBranches.join(', ')}${c.prNumber ? `\nPR #${c.prNumber}` : ''}
click for full detail`}
              >
                <Rails lanes={lanes} commit={c} first={idx === 0} last={idx === rows.length - 1} />
                <span className="gg-subject">{c.subject}</span>
                {c.isMerge && c.mergeFrom && c.inBranches[0] && c.mergeFrom !== c.inBranches[0] && (
                  <span className="gg-merge-badge">
                    {c.mergeFrom}
                    <i>→</i>
                    {c.inBranches[0]}
                  </span>
                )}
                <span className="gg-author">{c.author}</span>
                <span className="gg-sha">{c.short}</span>
                <span className="gg-age">{ago(c.date)}</span>
              </button>
            ))}
          </div>

          {remaining > 0 && (
            <div className="more">
              <button className="tab" onClick={() => setShown((n) => n + PAGE)}>
                Load {Math.min(PAGE, remaining)} more
                <span className="num"> · {remaining} left</span>
              </button>
            </div>
          )}

          {graph.truncated && remaining <= 0 && (
            <div className="idle">
              Showing the {graph.commits.length} most recent commits across these branches.{' '}
              <a href={`${repoUrl}/network`} target="_blank" rel="noreferrer">
                Full network graph on GitHub ↗
              </a>
            </div>
          )}

          {picked && (
            <div className="gl-detail">
              <div className="gl-detail-head">
                <code>{picked.short}</code>
                <a href={picked.url} target="_blank" rel="noreferrer">
                  {picked.subject}
                </a>
                <button className="detail-btn" onClick={() => setPicked(null)}>
                  Close
                </button>
              </div>
              <div className="gl-detail-grid">
                <span>Author</span>
                <b>@{picked.author}</b>
                <span>Committed</span>
                <b>
                  {when(picked.date)} · {ago(picked.date)} ago
                </b>
                <span>Pull request</span>
                <b>{picked.prNumber ? `#${picked.prNumber}` : '—'}</b>
                <span>Type</span>
                <b>
                  {picked.isMerge ? 'Merge commit' : 'Regular commit'}
                  {picked.isMerge &&
                    picked.mergeFrom &&
                    picked.inBranches[0] &&
                    picked.mergeFrom !== picked.inBranches[0] && (
                    <span className="gg-merge-badge inline">
                      {picked.mergeFrom}
                      <i>→</i>
                      {picked.inBranches[0]}
                    </span>
                  )}
                </b>
                <span>Present in</span>
                <b>
                  {lanes.map((l) => (
                    <span
                      key={l.branch}
                      className={`gl-chip${picked.inBranches.includes(l.branch) ? ' on' : ''}`}
                    >
                      {l.branch}
                    </span>
                  ))}
                </b>
                {picked.body && (
                  <>
                    <span>Message</span>
                    <b>
                      <pre className="gl-body">{picked.body}</pre>
                    </b>
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </details>
  )
}
