export type RepoKind = 'service' | 'frontend' | 'library' | 'tooling'

export interface RepoConfig {
  name: string
  kind: RepoKind
  /**
   * The integration branch drift is measured *from* — where merges land first.
   * In a main -> staging -> develop flow that is `develop`, not `main`.
   *
   * A list means "first of these that exists", for repos that disagree on
   * naming (develop vs dev-draft).
   */
  trunk: string | string[]
  /**
   * Branch pattern -> environment name. Patterns may contain a `*` glob.
   * Several patterns may map to the same environment; they are tried in order
   * and the first that exists wins.
   */
  branches: Record<string, string>
}

export interface ProjectConfig {
  key: string
  name: string
  org: string
  environments: string[]
  repos: RepoConfig[]
}

export interface Config {
  projects: ProjectConfig[]
}

export type RunState = 'success' | 'failure' | 'running' | 'queued' | 'none'

/** One cell of the release matrix: a repo at an environment. */
export interface EnvCell {
  env: string
  /** Resolved branch name (glob already expanded), or null when unmapped. */
  branch: string | null
  /** Short SHA for display. */
  sha: string | null
  /** Full SHA, used for compare calls. */
  fullSha: string | null
  /**
   * Commits waiting to come *into* this environment from the previous one in
   * the flow. The first environment measures against trunk.
   */
  ahead: number
  /** What this cell is compared against, for the tooltip. */
  comparedTo: string | null
  /** Age in days of the oldest commit still waiting. */
  oldestDays: number | null
  /**
   * Set when the comparison itself failed. Without this a failed compare
   * renders as "0 behind", which reads as healthy — the worst way to be wrong.
   */
  compareError: string | null
  state: RunState
  runUrl: string | null
  /** Set when the configured branch could not be resolved — surfaced loudly. */
  error: string | null
}

export interface RepoRow {
  name: string
  kind: RepoKind
  trunk: string
  cells: EnvCell[]
  error: string | null
}

export interface ActiveRun {
  repo: string
  title: string
  branch: string
  actor: string
  state: RunState
  url: string
  startedAt: string
  /** Median duration in seconds of recent successful runs of this workflow. */
  medianSeconds: number | null
}

export type PrStatus =
  | 'READY'
  | 'CONFLICTS'
  | 'BLOCKED'
  | 'NEEDS REVIEW'
  | 'WAITING CI'
  | 'CI FAILED'
  | 'DRAFT'
  | 'MERGED'
  | 'CLOSED'

export type CheckState =
  | 'success'
  | 'failure'
  | 'pending'
  | 'skipped'
  | 'cancelled'
  | 'neutral'

/** One check run or commit status on a PR's head commit. */
export interface PrCheck {
  name: string
  state: CheckState
  /** The workflow the check belongs to, when it is an Actions check run. */
  workflow: string | null
  url: string | null
  durationSeconds: number | null
  startedAt: string | null
  completedAt: string | null
}

export interface PullRequest {
  repo: string
  number: number
  title: string
  author: string
  baseRef: string
  url: string
  createdAt: string
  ageDays: number
  status: PrStatus
  /** Only populated on the repo detail page; the project list skips it. */
  checks: PrCheck[]
  checksTotal: number
  /** For closed tabs: when it was merged or closed, whichever applies. */
  endedAt: string | null
}

/** A commit sitting in one branch that has not reached the next. */
export interface WaitingCommit {
  sha: string
  message: string
  author: string
  date: string
  url: string
  /** Parsed from a squash-merge subject like "fix: thing (#123)". */
  prNumber: number | null
}

/** One step of the flow, with the commits actually stuck at it. */
export interface Hop {
  env: string
  from: string
  to: string
  ahead: number
  commits: WaitingCommit[]
  truncated: boolean
  error: string | null
}

export interface RepoDetail {
  project: ProjectConfig
  repo: RepoConfig
  trunk: string
  url: string
  cells: EnvCell[]
  hops: Hop[]
  runs: ActiveRun[]
  pulls: PullRequest[]
  closedPulls: PullRequest[]
  rowError: string | null
  warnings: string[]
}

export interface ProjectData {
  project: ProjectConfig
  rows: RepoRow[]
  active: ActiveRun[]
  pulls: PullRequest[]
  fetchedAt: string
  warnings: string[]
}
