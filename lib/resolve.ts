import { gh } from './github'
import type { CheckState, ResolvedCheck } from './types'

const RUN_URL = /github\.com\/([^/]+)\/([^/]+)\/actions\/runs\/(\d+)/

function stateFrom(s: string): CheckState {
  const v = s.toLowerCase()
  if (v === 'success') return 'success'
  if (v === 'pending') return 'pending'
  return 'failure'
}

function secondsBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null
  return Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 1000))
}

/**
 * Commit statuses carry no timing — the API only records when each state was
 * posted. But QA bots point `target_url` at the workflow run that produced
 * them, and that run is often in a *different* repo (elbe-qa-automation runs
 * the regression for web-elbe-ai). Following that link gets the real duration
 * and the per-job breakdown.
 *
 * Falls back to the span between the first `pending` and the final state,
 * which is close but includes queue time.
 */
export async function resolveStatusChecks(
  org: string,
  repo: string,
  prNumber: number,
): Promise<ResolvedCheck[]> {
  const pr = await gh().rest.pulls.get({ owner: org, repo, pull_number: prNumber })
  const sha = pr.data.head.sha

  const res = await gh().rest.repos.listCommitStatusesForRef({
    owner: org,
    repo,
    ref: sha,
    per_page: 100,
  })
  if (res.data.length === 0) return []

  // Oldest first, grouped by context.
  const byContext = new Map<string, typeof res.data>()
  for (const st of [...res.data].reverse()) {
    const list = byContext.get(st.context) ?? []
    list.push(st)
    byContext.set(st.context, list)
  }

  // One fetch per distinct run, even when several contexts share it.
  const runCache = new Map<string, any>()

  const out: ResolvedCheck[] = []

  for (const [context, entries] of byContext) {
    const latest = entries[entries.length - 1]
    const firstPending = entries.find((e) => e.state === 'pending') ?? entries[0]

    const check: ResolvedCheck = {
      name: context,
      state: stateFrom(latest.state),
      description: latest.description ?? null,
      startedAt: firstPending.created_at,
      completedAt: latest.state === 'pending' ? null : latest.created_at,
      durationSeconds: null,
      url: latest.target_url ?? null,
      workflow: null,
      foreignRepo: null,
      jobs: [],
      source: 'none',
    }

    // Any entry for this context may carry the run link; the final one often
    // points at a report page instead, so scan them all.
    const hit = entries.map((e) => e.target_url?.match(RUN_URL)).find(Boolean)

    if (hit) {
      const [, owner, runRepo, runId] = hit
      const key = `${owner}/${runRepo}/${runId}`
      try {
        if (!runCache.has(key)) {
          const run = await gh().rest.actions.getWorkflowRun({
            owner,
            repo: runRepo,
            run_id: Number(runId),
          })
          const jobs = await gh().rest.actions.listJobsForWorkflowRun({
            owner,
            repo: runRepo,
            run_id: Number(runId),
            per_page: 30,
          })
          runCache.set(key, { run: run.data, jobs: jobs.data.jobs })
        }
        const { run, jobs } = runCache.get(key)
        const started = run.run_started_at ?? run.created_at
        const ended = run.status === 'completed' ? run.updated_at : null

        check.workflow = run.name ?? null
        check.url = run.html_url ?? check.url
        check.startedAt = started
        check.completedAt = ended
        check.durationSeconds = secondsBetween(started, ended)
        check.source = 'run'
        check.foreignRepo =
          `${owner}/${runRepo}` === `${org}/${repo}` ? null : `${owner}/${runRepo}`
        check.jobs = (jobs ?? []).map((j: any) => ({
          name: j.name,
          conclusion: j.conclusion,
          durationSeconds: secondsBetween(j.started_at, j.completed_at),
        }))
      } catch {
        /* run deleted or in a repo the token cannot see — fall through */
      }
    }

    if (check.source === 'none' && entries.length > 1) {
      check.durationSeconds = secondsBetween(
        firstPending.created_at,
        latest.created_at,
      )
      if (check.durationSeconds !== null) check.source = 'statusspan'
    }

    out.push(check)
  }

  return out
}
