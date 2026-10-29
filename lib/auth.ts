export const PASSWORD = 'Test@12345'
export const COOKIE = 'dd_auth'
export const STORAGE_KEY = 'delivery-dashboard-auth'
export const DAY_MS = 24 * 60 * 60 * 1000

/** The cookie holds only an expiry timestamp. It is a latch, not a credential. */
export function validUntil(raw: string | undefined | null): number | null {
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) && n > Date.now() ? n : null
}
