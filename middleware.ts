import { NextResponse, type NextRequest } from 'next/server'
import { COOKIE, validUntil } from './lib/auth'

/**
 * The gate has to live here, not in the layout.
 *
 * A layout that declines to render `children` does not stop the page segment
 * from rendering — Next resolves them in parallel, so the dashboard markup
 * (and its GitHub calls) still happened and still reached the browser. A
 * rewrite in middleware runs before any of that.
 */
export function middleware(req: NextRequest) {
  if (validUntil(req.cookies.get(COOKIE)?.value)) return NextResponse.next()

  const url = req.nextUrl.clone()
  url.pathname = '/login'
  url.search = ''
  return NextResponse.rewrite(url)
}

export const config = {
  // Everything except Next's own assets and the server-action endpoint the
  // login form posts to.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
