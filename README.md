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

The dashboard is behind a password (`Test@12345`, set in `lib/auth.ts`). Signing
in stores an expiry in localStorage and a matching cookie for 24 hours. The check
lives in `middleware.ts`, so a signed-out request never reaches the page and costs
no GitHub calls.

Be clear-eyed about what that is: the password ships in the client bundle and the
cookie is a timestamp anyone can write. It keeps the board off a passer-by's
screen. The GitHub token, which never leaves the server, is the real secret.

To keep it running, `./run-dashboard.sh` supervises `next dev` and restarts it if
it exits.

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

There is no webhook endpoint. For ten repos the 60s cache plus a button covers it,
and it keeps the app to a single moving part.

Measured cost: a project board is ~37 REST plus 3 GraphQL calls for FMA, ~22 plus
2 for Elbe. A repo detail page is ~6 REST. The branch graph adds ~5 and the PR
check resolution ~2 plus one per distinct run, both only when expanded. Against a
5,000/hour limit, one board left open all day is roughly 2,200 calls; both is
about 3,500. A signed-out or unopened tab costs nothing.

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

**Repo detail** — click any repo name in the matrix.

*Pull requests* come first, with Open and Closed tabs, newest first in both, 20 at
a time. Each PR lists its individual checks as pills; **Details** expands a table
of every check with workflow, status, start, finish and duration, plus a Copy link
button that deep-links to that expanded view (`#pr-160`). A **Base** filter
narrows the list to one configured branch, with an *Other* chip when something
targets a branch the config does not know about.

*Pipeline* shows each environment's branch, SHA and run status.

*Hop panels* are accordions, one per step, listing the commits actually waiting
there with author, PR number and age. This is where `↑22` turns into twenty-two
named commits. GitHub caps a comparison at 250, so a larger gap says so rather
than showing a partial list quietly.

*Branch graph* — a commit-per-row graph of the configured branches only, never
all of them (one repo here has 1092). Coloured rails per branch, a dot where a
commit is present, rings for merge commits. Merge rows carry a `staging → main`
badge read from the commit subject, and a curve connects each cross-lane merge to
the branch tip it absorbed. The **Graph** link in the header opens and scrolls to
it. Loads only when expanded.

**Open pull requests** — sorted by what you can act on, not by date. `READY` first,
`DRAFT` last. Ages over seven days are highlighted.

## Check timings, including other repos'

An Actions check run reports its own duration. A **commit status** does not — the
API records only when each state was posted, and GraphQL returns just the latest
one per context, leaving a single timestamp with nothing to subtract from.

Expanding a PR's Details resolves them properly. Every status for a context is
read, not just the newest, because the final one often links to a report page
while the run link sits on an earlier `pending` entry. That link is followed to
the workflow run behind it — which may live in **a different repo**, as
`qa/staging-regression` on `web-elbe-ai` is produced by `elbe-qa-automation`.

Three tiers, so a check always shows the best answer available:

| Source | When | Shown as |
|---|---|---|
| the run | a run link exists anywhere in the status trail | exact duration, workflow name, per-job breakdown |
| status span | no run link but several statuses | `8m03s ~` — the tilde marks it as inferred; it includes queue time |
| none | a single status only | `—` |

A run in another repo is labelled with where it came from.

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
