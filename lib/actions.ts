'use server'

import { updateTag } from 'next/cache'
import { projectTag } from './data'
import { getProject } from './config'
import { resolveStatusChecks } from './resolve'
import type { ResolvedCheck } from './types'

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
