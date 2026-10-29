import { unstable_cache } from 'next/cache'
import { gh, settle } from './github'
import type {
  ActiveRun,
  EnvCell,
  ProjectConfig,
  ProjectData,
  Hop,
  RepoDetail,
  WaitingCommit,
  PullRequest,
  PrStatus,
  RepoConfig,
  RepoRow,
  RunState,
} from './types'

const RUN_PAGE_SIZE = 25
const FAILURE_PIN_MINUTES = 30

/** A GitHub Actions run, trimmed to what the dashboard uses. */
interface Run {
  branch: string
  sha: string
  state: RunState
  url: string
  title: string
  actor: string
  startedAt: string
  updatedAt: string
  workflowId: number
  durationSeconds: number | null
}

function runState(status: string | null, conclusion: string | null): RunState {
  if (status === 'in_progress') return 'running'
  if (status === 'queued' || status === 'requested' || status === 'waiting') return 'queued'
  if (conclusion === 'success') return 'success'
  if (conclusion === null) return 'none'
  return 'failure'
}

async function fetchRuns(org: string, repo: string): Promise<Run[]> {
  const res = await gh().rest.actions.listWorkflowRunsForRepo({
    owner: org,
    repo,
    per_page: RUN_PAGE_SIZE,
  })

  return res.data.workflow_runs.map((r) => {
    const started = r.run_started_at ?? r.created_at
    const done = r.status === 'completed' ? r.updated_at : null
    return {
      branch: r.head_branch ?? '',
      sha: r.head_sha,
      state: runState(r.status, r.conclusion),
      url: r.html_url,
      title: r.display_title || r.name || 'workflow run',
      actor: r.actor?.login ?? 'unknown',
      startedAt: started,
      updatedAt: r.updated_at,
      workflowId: r.workflow_id,
      durationSeconds: done
        ? Math.round((Date.parse(done) - Date.parse(started)) / 1000)
        : null,
    }
  })
}

/**
 * Resolve a configured branch pattern to a real branch name.
 *
 * Globs pick the greatest match under a numeric-aware comparison, so
 * `release/1.10.0` correctly beats `release/1.9.0` without zero padding.
 */
async function resolveBranch(
  org: string,
  repo: string,
  pattern: string,
): Promise<string | null> {
  if (!pattern.includes('*')) return pattern

  const res = await gh().rest.repos.listBranches({
    owner: org,
    repo,
    per_page: 100,
  })
  const rx = new RegExp('^' + pattern.split('*').map(escapeRx).join('.*') + '$')
  const matches = res.data.map((b) => b.name).filter((n) => rx.test(n))
  matches.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
  return matches.at(-1) ?? null
}

function escapeRx(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Describe why a GitHub call failed, distinguishing auth and permission
 * problems from a genuinely missing branch. Reporting "branch not found" for
 * a 401 sends people debugging the wrong thing.
 */
function describe(err: any, subject: string): string {
  const status = err?.status
  if (status === 401) return 'GitHub auth failed — check GITHUB_TOKEN'
  if (status === 403) return 'access denied or rate limited'
  if (status === 404) return `${subject} not found (or token lacks access)`
  return err?.message ?? `could not read ${subject}`
}

/**
 * Resolve the first candidate pattern that names a branch which exists.
 *
 * A 404 means "try the next candidate". Anything else (auth, rate limit) is
 * rethrown — swallowing those would report a dead token as a missing branch,
 * which is the failure mode this dashboard exists to avoid.
 */
async function resolveRef(
  org: string,
  repo: string,
  patterns: string[],
): Promise<{ branch: string; sha: string } | null> {
  for (const pattern of patterns) {
    const branch = await resolveBranch(org, repo, pattern)
    if (!branch) continue
    try {
      const res = await gh().rest.repos.getBranch({ owner: org, repo, branch })
      return { branch, sha: res.data.commit.sha }
    } catch (err: any) {
      if (err?.status === 404) continue
      throw err
    }
  }
  return null
}

/**
 * Explain a failed branch resolution by saying what the repo actually has.
 *
 * Without this, a wrong org name reports as "no trunk branch matching dev" on
 * every repo — pointing at the branch config when the real fault is one line
 * above it.
 */
async function explainMissing(
  org: string,
  repo: string,
  patterns: string[],
): Promise<string> {
  const wanted = patterns.map((p) => `"${p}"`).join(' or ')
  try {
    const res = await gh().rest.repos.listBranches({ owner: org, repo, per_page: 100 })
    const names = res.data.map((b) => b.name)
    const likely = names.filter((n) => !n.includes('/'))
    const shown = (likely.length ? likely : names).slice(0, 8).join(', ')
    const more = Math.max(0, (likely.length || names.length) - 8)
    return `no branch matching ${wanted} — repo has: ${shown}${more ? ` (+${more} more)` : ''}`
  } catch (err: any) {
    if (err?.status === 404) {
      return `repository ${org}/${repo} not found — check the org name and token access`
    }
    return `no branch matching ${wanted} (${describe(err, 'branches')})`
  }
}

async function buildCell(
  org: string,
  repo: RepoConfig,
  patterns: string[],
  env: string,
  runs: Run[],
): Promise<EnvCell> {
  const base: EnvCell = {
    env,
    branch: null,
    sha: null,
    fullSha: null,
    ahead: 0,
    comparedTo: null,
    oldestDays: null,
    compareError: null,
    state: 'none',
    runUrl: null,
    error: null,
  }

  let branch: string
  let sha: string
  try {
    const ref = await resolveRef(org, repo.name, patterns)
    if (!ref) {
      // Loud failure: an unresolvable branch would otherwise read as "ahead 0",
      // which looks healthy. See PLAN.md G6.
      return { ...base, error: await explainMissing(org, repo.name, patterns) }
    }
    branch = ref.branch
    sha = ref.sha
  } catch (err) {
    return { ...base, error: describe(err, `branch for ${env}`) }
  }

  const run = runs.find((r) => r.branch === branch)

  return {
    env,
    branch,
    sha: sha.slice(0, 7),
    fullSha: sha,
    ahead: 0,
    comparedTo: null,
    oldestDays: null,
    compareError: null,
    state: run?.state ?? 'none',
    runUrl: run?.url ?? null,
    error: null,
  }
}

async function buildRow(
  project: ProjectConfig,
  repo: RepoConfig,
  runs: Run[],
): Promise<RepoRow> {
  const trunkCandidates = Array.isArray(repo.trunk) ? repo.trunk : [repo.trunk]
  let trunkSha: string | null = null
  let trunkName = trunkCandidates[0] ?? '(none)'

  try {
    const ref = await resolveRef(project.org, repo.name, trunkCandidates)
    if (!ref) {
      return {
        name: repo.name,
        kind: repo.kind,
        trunk: trunkName,
        cells: [],
        error: 'trunk: ' + (await explainMissing(project.org, repo.name, trunkCandidates)),
      }
    }
    trunkName = ref.branch
    trunkSha = ref.sha
  } catch (err) {
    return {
      name: repo.name,
      kind: repo.kind,
      trunk: trunkName,
      cells: [],
      error: describe(err, 'trunk branch'),
    }
  }

  const cells = await Promise.all(
    project.environments.map((env) => {
      const patterns = Object.keys(repo.branches).filter((p) => repo.branches[p] === env)
      if (patterns.length === 0) {
        const empty: EnvCell = {
          env,
          branch: null,
          sha: null,
          fullSha: null,
          ahead: 0,
          comparedTo: null,
          oldestDays: null,
      compareError: null,
          state: 'none',
          runUrl: null,
          error: null,
        }
        return Promise.resolve(empty)
      }
      return buildCell(project.org, repo, patterns, env, runs)
    }),
  )

  // Each environment measures what is waiting to come into it from the
  // previous one in the flow: staging against dev, prod against staging.
  // The first environment measures against trunk. Environments with no mapped
  // branch are skipped, so prod compares against dev when staging is absent.
  let prevSha: string | null = trunkSha
  let prevName = trunkName

  for (const cell of cells) {
    if (cell.error || !cell.fullSha) continue

    cell.comparedTo = prevName

    if (prevSha && prevSha !== cell.fullSha) {
      try {
        const cmp = await gh().rest.repos.compareCommitsWithBasehead({
          owner: project.org,
          repo: repo.name,
          basehead: `${cell.fullSha}...${prevSha}`,
        })
        cell.ahead = cmp.data.ahead_by
        const oldest = cmp.data.commits[0]?.commit?.committer?.date
        if (oldest) {
          cell.oldestDays = Math.floor((Date.now() - Date.parse(oldest)) / 86_400_000)
        }
      } catch (err) {
        // Never leave this at 0 silently: a rate-limited or failed compare
        // would render as "in sync" and hide real drift.
        cell.compareError = describe(err, 'comparison')
      }
    }

    prevSha = cell.fullSha
    prevName = cell.branch ?? prevName
  }

  return { name: repo.name, kind: repo.kind, trunk: trunkName, cells, error: null }
}

function medianDuration(runs: Run[], workflowId: number): number | null {
  const samples = runs
    .filter((r) => r.workflowId === workflowId && r.state === 'success')
    .map((r) => r.durationSeconds)
    .filter((d): d is number => d !== null)
    .sort((a, b) => a - b)

  if (samples.length === 0) return null
  return samples[Math.floor(samples.length / 2)]
}

function activeRuns(repo: string, runs: Run[]): ActiveRun[] {
  const cutoff = Date.now() - FAILURE_PIN_MINUTES * 60_000

  return runs
    .filter((r) => {
      if (r.state === 'running' || r.state === 'queued') return true
      // Failures stay pinned briefly so they are seen, then fall through
      // to the matrix.
      return r.state === 'failure' && Date.parse(r.updatedAt) > cutoff
    })
    .map((r) => ({
      repo,
      title: r.title,
      branch: r.branch,
      actor: r.actor,
      state: r.state,
      url: r.url,
      startedAt: r.startedAt,
      medianSeconds: medianDuration(runs, r.workflowId),
    }))
}

/** One GraphQL call covering every tracked repo's open PRs. */
async function fetchPulls(project: ProjectConfig): Promise<PullRequest[]> {
  const tracked = project.repos
  if (tracked.length === 0) return []

  const fragments = tracked
    .map(
      (r, i) => `
    r${i}: repository(owner: "${project.org}", name: "${r.name}") {
      name
      pullRequests(states: OPEN, first: 50, orderBy: {field: CREATED_AT, direction: DESC}) {
        nodes {
          number title isDraft createdAt url baseRefName
          author { login }
          mergeable
          reviewDecision
          commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
        }
      }
    }`,
    )
    .join('\n')

  let data: Record<string, any>
  try {
    data = await gh().graphql(`query { ${fragments} }`)
  } catch (err: any) {
    // Partial GraphQL errors still carry data — use whatever resolved.
    if (!err?.data) throw err
    data = err.data
  }

  const out: PullRequest[] = []
  for (const key of Object.keys(data ?? {})) {
    const node = data[key]
    if (!node) continue
    for (const pr of node.pullRequests?.nodes ?? []) {
      if (!pr) continue
      const checks = pr.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state ?? null
      out.push({
        repo: node.name,
        number: pr.number,
        title: pr.title,
        author: pr.author?.login ?? 'ghost',
        baseRef: pr.baseRefName,
        url: pr.url,
        createdAt: pr.createdAt,
        ageDays: Math.floor((Date.now() - Date.parse(pr.createdAt)) / 86_400_000),
        status: prStatus(pr.isDraft, pr.reviewDecision, pr.mergeable, checks),
      })
    }
  }
  return out
}

/** Collapse three GitHub fields into one verdict. See PLAN.md §3.4. */
function prStatus(
  isDraft: boolean,
  review: string | null,
  mergeable: string | null,
  checks: string | null,
): PrStatus {
  if (isDraft) return 'DRAFT'
  if (mergeable === 'CONFLICTING') return 'CONFLICTS'
  if (review === 'CHANGES_REQUESTED') return 'BLOCKED'
  if (checks === 'FAILURE' || checks === 'ERROR') return 'CI FAILED'
  if (checks === 'PENDING' || checks === 'EXPECTED') return 'WAITING CI'
  if (review === 'APPROVED') return 'READY'
  return 'NEEDS REVIEW'
}

const STATUS_RANK: Record<PrStatus, number> = {
  READY: 0,
  'NEEDS REVIEW': 1,
  'WAITING CI': 2,
  'CI FAILED': 3,
  CONFLICTS: 4,
  BLOCKED: 5,
  DRAFT: 6,
}

/**
 * Cached entry point. The ~37 GitHub calls are what cost; the render is cheap.
 * Caching here rather than with a page-level `revalidate` keeps the page
 * dynamic, so `notFound()` still returns a real 404 and per-request clocks
 * (elapsed timers) stay live.
 */
export function getCachedProjectData(project: ProjectConfig): Promise<ProjectData> {
  return unstable_cache(() => getProjectData(project), ['project-data', project.key], {
    revalidate: 60,
    tags: [projectTag(project.key)],
  })()
}

export function projectTag(key: string): string {
  return `project:${key}`
}

/** Squash merges put the PR number in the subject: "fix: thing (#123)". */
function prNumberFrom(message: string): number | null {
  const m = message.split('\n')[0].match(/\(#(\d+)\)\s*$/)
  return m ? Number(m[1]) : null
}

async function buildHops(
  project: ProjectConfig,
  repo: RepoConfig,
  trunkName: string,
  cells: EnvCell[],
): Promise<Hop[]> {
  const hops: Hop[] = []
  let prev = cells.find((c) => c.branch === trunkName) ?? null

  for (const cell of cells) {
    if (!cell.branch || !cell.fullSha || cell.error) continue
    if (!prev || prev.branch === cell.branch) {
      prev = cell
      continue
    }

    const hop: Hop = {
      env: cell.env,
      from: prev.branch!,
      to: cell.branch,
      ahead: cell.ahead,
      commits: [],
      truncated: false,
      error: cell.compareError,
    }

    if (cell.ahead > 0 && !cell.compareError) {
      try {
        const cmp = await gh().rest.repos.compareCommitsWithBasehead({
          owner: project.org,
          repo: repo.name,
          basehead: `${cell.fullSha}...${prev.fullSha}`,
        })
        // GitHub caps the inline commit list at 250 regardless of ahead_by.
        hop.truncated = cmp.data.commits.length < cmp.data.ahead_by
        hop.commits = cmp.data.commits
          .map((c): WaitingCommit => ({
            sha: c.sha.slice(0, 7),
            message: c.commit.message.split('\n')[0],
            author: c.author?.login ?? c.commit.author?.name ?? 'unknown',
            date: c.commit.committer?.date ?? c.commit.author?.date ?? '',
            url: c.html_url,
            prNumber: prNumberFrom(c.commit.message),
          }))
          .reverse() // newest first
      } catch (err) {
        hop.error = describe(err, 'commit list')
      }
    }

    hops.push(hop)
    prev = cell
  }

  return hops
}

export async function getRepoDetail(
  project: ProjectConfig,
  repoName: string,
): Promise<RepoDetail | null> {
  const repo = project.repos.find((r) => r.name === repoName)
  if (!repo) return null

  const runs = (await settle([fetchRuns(project.org, repo.name)]))[0] ?? []
  const row = await buildRow(project, repo, runs)

  const warnings: string[] = []
  for (const cell of row.cells) {
    if (cell.error) warnings.push(`${cell.env}: ${cell.error}`)
    if (cell.compareError) warnings.push(`${cell.env}: ${cell.compareError}`)
  }

  const hops = row.error ? [] : await buildHops(project, repo, row.trunk, row.cells)

  let pulls: PullRequest[] = []
  try {
    pulls = (await fetchPulls({ ...project, repos: [repo] })).sort(
      (a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || b.ageDays - a.ageDays,
    )
  } catch (err) {
    warnings.push(`Pull requests: ${describe(err, 'pull requests')}`)
  }

  return {
    project,
    repo,
    trunk: row.trunk,
    url: `https://github.com/${project.org}/${repo.name}`,
    cells: row.cells,
    hops,
    runs: activeRuns(repo.name, runs).slice(0, 10),
    pulls,
    rowError: row.error,
    warnings,
  }
}

export function getCachedRepoDetail(
  project: ProjectConfig,
  repoName: string,
): Promise<RepoDetail | null> {
  return unstable_cache(
    () => getRepoDetail(project, repoName),
    ['repo-detail', project.key, repoName],
    { revalidate: 60, tags: [projectTag(project.key)] },
  )()
}

export async function getProjectData(project: ProjectConfig): Promise<ProjectData> {
  const warnings: string[] = []

  const runsPerRepo = await settle(
    project.repos.map((r) => fetchRuns(project.org, r.name)),
  )

  const rows = await Promise.all(
    project.repos.map((repo, i) => buildRow(project, repo, runsPerRepo[i] ?? [])),
  )

  const active = project.repos
    .flatMap((repo, i) => activeRuns(repo.name, runsPerRepo[i] ?? []))
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))

  let pulls: PullRequest[] = []
  try {
    pulls = await fetchPulls(project)
  } catch (err) {
    warnings.push(`Could not load pull requests: ${describe(err, 'pull requests')}`)
  }

  pulls.sort(
    (a, b) =>
      STATUS_RANK[a.status] - STATUS_RANK[b.status] || b.ageDays - a.ageDays,
  )

  for (const row of rows) {
    if (row.error) warnings.push(`${row.name}: ${row.error}`)
    for (const cell of row.cells) {
      if (cell.error) warnings.push(`${row.name} → ${cell.env}: ${cell.error}`)
    }
  }

  return {
    project,
    rows,
    active,
    pulls,
    fetchedAt: new Date().toISOString(),
    warnings,
  }
}
