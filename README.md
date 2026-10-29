# Delivery Dashboard

One page showing merge, build and deploy state across every repo in both client
projects. No database — GitHub is the source of truth and the app is a cached view
over its API. See [PLAN.md](PLAN.md) for the full design.

## Setup

```bash
npm install
cp .env.example .env     # add a GitHub token
npm run dev
```

The token needs read access to every tracked repo: `repo`, `read:org`, and Actions
read. A classic PAT is fine for internal use.

## Configuration

Everything lives in [`config/projects.json`](config/projects.json). Adding a repo
means editing that file and redeploying — there is no admin UI by design, so the
config carries git history and review.

```json
{
  "name": "api-core",
  "kind": "service",
  "trunk": "main",
  "branches": { "develop": "dev", "release/*": "staging", "main": "prod" }
}
```

- `kind` — `service` | `frontend` | `library` | `tooling`. Libraries and tooling
  have no environments; give them `"branches": {}`.
- `trunk` — the branch drift is measured *from*. In gitflow repos this is usually
  `develop`, not `main`.
- `branches` — branch pattern to environment. Patterns may contain `*`; the
  lexicographically greatest match wins, so zero-pad release numbers
  (`release/1.09.0`) if you use more than nine minor versions.

Environments are branch-driven: whatever sits at the head of the mapped branch is
treated as deployed to that environment.

## Refreshing

Two different refreshes, deliberately:

- **The Refresh button** expires the cache tag and refetches from GitHub. Use it
  when you have just merged something and want to see it now.
- **A 20s interval** only re-renders. Elapsed timers keep moving and no API quota
  is spent. Data is at most 60s old on its own.

There is no webhook endpoint. For nine repos the 60s cache plus a button covers it,
and it keeps the app to a single moving part.

## What the views mean

**Right now** — runs currently queued or in progress, plus failures from the last
30 minutes. Empty is the all-clear. A progress bar estimates completion from the
median of recent successful runs of the same workflow.

**Release matrix** — one row per repo, one column per environment. `↑12` means
twelve commits are merged to trunk but have not reached that environment. Red
above ten.

**Branch promotion** — deployment-independent. For repos whose environments map to
different branches, shows how far each hop (`develop → main`) has fallen behind and
the age of the oldest unpromoted commit. Age is the stronger signal of the two.

**Open pull requests** — sorted by what you can act on, not by date. `READY` first,
`DRAFT` last. Ages over seven days are highlighted.

## Known behaviour: 404s return 200

An unknown project URL (`/typo`) renders the correct "no such project" page but
with HTTP 200. This is documented Next.js behaviour, not a bug here:

> Before streaming starts, Next.js returns a 404 status code. After streaming
> starts, the status code remains 200 and the not-found UI renders in the response.
> — `not-found.js` file conventions

Reaching `notFound()` requires `await params`, by which point streaming has begun.
Next injects `<meta name="robots" content="noindex">` either way.

Left as is: nothing consumes status codes from this app. If it ever matters, the
documented fix is `app/global-not-found.js`.

## Warnings banner

A red banner means a configured branch could not be resolved. This is deliberately
loud: an unresolvable branch otherwise reports `↑0`, which reads as healthy and is
the worst way for this dashboard to fail.
