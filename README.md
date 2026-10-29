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
  "name": "FMA-Node-Service",
  "kind": "service",
  "trunk": ["dev", "dev-draft"],
  "branches": {
    "dev": "dev",
    "dev-draft": "dev",
    "staging": "staging",
    "main": "prod"
  }
}
```

- `kind` — `service` | `frontend` | `library` | `tooling`. Libraries and tooling
  with nothing to deploy take `"branches": {}`.
- `trunk` — the branch drift is measured **from**: where merges land first. In a
  `dev → staging → main` flow that is `dev`, **not** `main`. Getting this
  backwards makes every cell report `↑0`, which looks healthy and is wrong.
  A list means "first of these that exists", for repos that disagree on naming.
- `branches` — branch pattern to environment. Several patterns may map to the
  same environment; they are tried in order and the first that exists wins, which
  is how `dev` (most repos) and `dev-draft` (frontends) coexist. Patterns may contain `*`; matches are
  compared numerically, so `release/1.10.0` beats `release/1.9.0`.
- `environments` — listed in **flow order** (`dev`, `staging`, `prod`). The branch
  promotion view derives its hops from this order.

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

**Release matrix** — one row per repo, one column per environment.

Each cell measures what is waiting to come **into** that environment from the
previous one in the flow: staging against dev, prod against staging. The first
environment measures against trunk. So `↑12` on prod means twelve commits sit in
staging that have not been released.

Red above ten. A second amber number is the age in days of the oldest waiting
commit — usually the more alarming of the two.

A `?` badge means the comparison itself failed (rate limit, or a force-pushed
branch). It is deliberately not rendered as `↑0`, which would read as in sync.

**Repo detail** — click any repo name in the matrix. Shows the pipeline as a
strip, then one panel per hop listing the actual commits stuck at it with author,
PR number and age, followed by that repo's open PRs and recent runs. This is where
`↑22` turns into twenty-two named commits.

GitHub caps a comparison at 250 commits, so a larger gap says so rather than
quietly showing a partial list.

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
