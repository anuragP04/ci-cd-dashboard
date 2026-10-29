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
  /** Commits on trunk that have not reached this branch. */
  ahead: number
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
}

/** One hop in the branch flow, e.g. develop -> release. */
export interface PromotionPair {
  repo: string
  from: string
  to: string
  ahead: number
  /** Age in days of the oldest unpromoted commit. */
  oldestDays: number | null
  error: string | null
}

export interface ProjectData {
  project: ProjectConfig
  rows: RepoRow[]
  promotions: PromotionPair[]
  active: ActiveRun[]
  pulls: PullRequest[]
  fetchedAt: string
  warnings: string[]
}
