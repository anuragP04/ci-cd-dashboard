'use server'

import { updateTag } from 'next/cache'
import { projectTag } from './data'
import { getProject } from './config'
import { resolveStatusChecks } from './resolve'
import type { ResolvedCheck } from './types'
import { gh } from './github'
import { getBranchGraph, type BranchGraph } from './graph'

/**
 * Drop this project's cached GitHub data so the next render refetches.
 *
 * `updateTag` rather than `revalidateTag` because this runs in a server action
 * and we want read-your-own-writes: the refresh that follows must see fresh
 * data, not the entry we just expired.
 */
export async function refreshProject(key: string): Promise<void> {
  updateTag(projectTag(key))
}

/**
 * Resolve a PR's commit statuses into real timings by following each one's
 * target_url to the workflow run behind it — including runs in a different
 * repo. Called when a PR's Details panel is expanded, so the extra API calls
 * are only spent on the PR you are actually looking at.
 */
export async function fetchCheckDetail(
  projectKey: string,
  repoName: string,
  prNumber: number,
): Promise<{ checks: ResolvedCheck[]; error: string | null }> {
  const project = getProject(projectKey)
  if (!project) return { checks: [], error: 'unknown project' }

  try {
    return { checks: await resolveStatusChecks(project.org, repoName, prNumber), error: null }
  } catch (err: any) {
    return { checks: [], error: err?.message ?? 'could not load check detail' }
  }
}

/**
 * Branch graph for a repo, loaded when its panel is expanded so the page
 * itself costs nothing extra.
 *
 * `main` is always included even when the config does not map it, because a
 * graph that omits the production branch answers the wrong question.
 */
export async function fetchBranchGraph(
  projectKey: string,
  repoName: string,
  branches: string[],
  envByBranch: Record<string, string>,
): Promise<BranchGraph> {
  const project = getProject(projectKey)
  if (!project) return { lanes: [], commits: [], truncated: false, error: 'unknown project' }

  let lanes = [...branches]
  try {
    const info = await gh().rest.repos.get({ owner: project.org, repo: repoName })
    const def = info.data.default_branch
    if (def && !lanes.includes(def)) lanes.push(def)
  } catch {
    if (!lanes.includes('main')) lanes.push('main')
  }

  try {
    return await getBranchGraph(project.org, repoName, lanes, envByBranch)
  } catch (err: any) {
    return {
      lanes: [],
      commits: [],
      truncated: false,
      error: err?.message ?? 'could not build the branch graph',
    }
  }
}
