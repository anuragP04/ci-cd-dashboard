import { Octokit } from 'octokit'

let client: Octokit | null = null

/**
 * Lazily constructed so a missing token fails at request time with a readable
 * message, rather than at import time during `next build`.
 */
export function gh(): Octokit {
  if (client) return client

  const token = process.env.GITHUB_TOKEN
  if (!token) {
    throw new Error('GITHUB_TOKEN is not set — copy .env.example to .env and fill it in')
  }

  client = new Octokit({ auth: token })
  return client
}

/** Settle a batch of promises, discarding (but logging) individual failures. */
export async function settle<T>(tasks: Promise<T>[]): Promise<(T | null)[]> {
  const results = await Promise.allSettled(tasks)
  return results.map((r) => {
    if (r.status === 'fulfilled') return r.value
    console.error('[github]', r.reason?.message ?? r.reason)
    return null
  })
}
