import { gh, settle } from './github'

const PER_BRANCH = 100
const WINDOW = 70

export interface GraphCommit {
  sha: string
  short: string
  subject: string
  body: string
  author: string
  avatar: string | null
  date: string
  url: string
  prNumber: number | null
  isMerge: boolean
  /** The branch this merge absorbed, read off the subject. */
  mergeFrom: string | null
  /** Parent SHAs, kept for drawing true ancestry links later. */
  parents: string[]
  /** Branch names, in lane order, whose history contains this commit. */
  inBranches: string[]
}

export interface GraphLane {
  branch: string
  env: string | null
  /** True when this lane shares no commits with the lane above it. */
  detached: boolean
  total: number
}

export interface BranchGraph {
  lanes: GraphLane[]
  commits: GraphCommit[]
  truncated: boolean
  error: string | null
}

/**
 * The branch a merge commit absorbed.
 *
 * GitHub writes "Merge pull request #194 from elbe-ai/staging", and a plain
 * `git merge` writes "Merge branch 'staging' into main". Both name the source,
 * which is the half the lane dots cannot tell you — the target is simply the
 * branch the commit sits on.
 */
function mergeSourceFrom(message: string): string | null {
  const first = message.split('\n')[0]

  const pr = first.match(/^Merge pull request #\d+ from (?:[^/\s]+\/)?(\S+)/)
  if (pr) return pr[1]

  const branch = first.match(/^Merge branch '([^']+)'/)
  if (branch) return branch[1]

  const remote = first.match(/^Merge remote-tracking branch '(?:[^/]+\/)?([^']+)'/)
  if (remote) return remote[1]

  // "Merge origin/develop into feat/rbac-setup" — git's own wording when you
  // merge a tracking ref without quotes.
  const bare = first.match(/^Merge (?:[^/\s]+\/)?(\S+) into \S+/)
  if (bare) return bare[1]

  return null
}

function prNumberFrom(message: string): number | null {
  const first = message.split('\n')[0]
  const squash = first.match(/\(#(\d+)\)\s*$/)
  if (squash) return Number(squash[1])
  const merge = first.match(/^Merge pull request #(\d+)\b/)
  return merge ? Number(merge[1]) : null
}

/**
 * Commits across the repo's configured branches, aligned on one timeline.
 *
 * Each branch is fetched independently and the results unioned by SHA, so a
 * commit present in several branches appears once with every lane that holds
 * it. That alignment is the whole point: a column filled at the top and empty
 * below is work that has not propagated.
 *
 * Only configured branches are fetched. web-elbe-ai has over a thousand
 * branches and graphing them all would be unreadable and slow.
 */
export async function getBranchGraph(
  org: string,
  repo: string,
  branchesInOrder: string[],
  envByBranch: Record<string, string>,
): Promise<BranchGraph> {
  if (branchesInOrder.length === 0) {
    return { lanes: [], commits: [], truncated: false, error: null }
  }

  const fetched = await settle(
    branchesInOrder.map((b) =>
      gh().rest.repos.listCommits({ owner: org, repo, sha: b, per_page: PER_BRANCH }),
    ),
  )

  const byBranch = new Map<string, any[]>()
  branchesInOrder.forEach((b, i) => {
    const res = fetched[i]
    if (res) byBranch.set(b, res.data)
  })

  if (byBranch.size === 0) {
    return { lanes: [], commits: [], truncated: false, error: 'no branch history readable' }
  }

  // Union by SHA, remembering which lanes hold each commit.
  const union = new Map<string, GraphCommit>()
  for (const [branch, commits] of byBranch) {
    for (const c of commits) {
      const existing = union.get(c.sha)
      if (existing) {
        existing.inBranches.push(branch)
        continue
      }
      const msg: string = c.commit.message ?? ''
      union.set(c.sha, {
        sha: c.sha,
        short: c.sha.slice(0, 7),
        subject: msg.split('\n')[0],
        body: msg.split('\n').slice(1).join('\n').trim(),
        author: c.author?.login ?? c.commit.author?.name ?? 'unknown',
        avatar: c.author?.avatar_url ?? null,
        date: c.commit.committer?.date ?? c.commit.author?.date ?? '',
        url: c.html_url,
        prNumber: prNumberFrom(msg),
        isMerge: (c.parents?.length ?? 0) > 1,
        mergeFrom: (c.parents?.length ?? 0) > 1 ? mergeSourceFrom(msg) : null,
        parents: (c.parents ?? []).map((p: any) => p.sha),
        inBranches: [branch],
      })
    }
  }

  const all = [...union.values()].sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
  const commits = all.slice(0, WINDOW)

  // Keep lane order as configured, and keep inBranches in that same order.
  const order = new Map(branchesInOrder.map((b, i) => [b, i]))
  for (const c of commits) {
    c.inBranches.sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99))
  }

  const lanes: GraphLane[] = branchesInOrder
    .filter((b) => byBranch.has(b))
    .map((branch, i, arr) => {
      const mine = new Set((byBranch.get(branch) ?? []).map((c: any) => c.sha))
      const prev = i === 0 ? null : arr[i - 1]
      const prevShas = prev
        ? new Set((byBranch.get(prev) ?? []).map((c: any) => c.sha))
        : null
      const shared = prevShas ? [...mine].some((s) => prevShas.has(s)) : true
      return {
        branch,
        env: envByBranch[branch] ?? null,
        detached: !shared,
        total: mine.size,
      }
    })

  return {
    lanes,
    commits,
    truncated: all.length > commits.length,
    error: null,
  }
}
