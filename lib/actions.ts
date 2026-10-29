'use server'

import { updateTag } from 'next/cache'
import { projectTag } from './data'

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
