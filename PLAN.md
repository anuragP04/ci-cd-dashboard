# Delivery Dashboard — Implementation Plan

**Status:** Draft · **Owner:** Anurag · **Last updated:** 2026-10-29

A single pane of glass across two client projects (9 repos) answering four questions
without opening GitHub: what is merged, what is waiting to merge, what is deployed
where, and what is broken right now.

---

## 1. Problem

Two teams, two projects, one client. Nine repositories between them. Today the state
of delivery lives across nine GitHub tabs, the Actions UI, and whatever someone
remembers. As engineering lead the recurring unanswerable questions are:

- Is the fix I approved on Tuesday actually live on prod?
- Which repos have merged work sitting undeployed?
- What's failing right now, and did anyone notice?
- Which PRs can be merged today, and which are stuck and why?

### Scope

| Project | Repos | Composition |
|---|---|---|
| A | 6 | 2 frontend, 1 node backend, 1 python, 1 auth, 1 shared |
| B | 3 | 1 next, 1 node, 1 python/QA |

Both projects live in one deployment with a project switcher — **not** two apps. Same
client, same schema, and a combined "everything red right now" view across all nine
repos is wanted. Scope by `project_id`.

---

## 2. Confirmed decisions

Answered 2026-10-29. These are settled, not assumptions.

| # | Decision | Consequence |
|---|---|---|
| D1 | All repos in one GitHub org | Single token / single App install |
| D2 | CI/CD is GitHub Actions | Actions API is the only ingestion adapter |
| D3 | **Environments are branch-based** | The branch map in §4 is the *primary* mechanism, not a fallback. The `environment:` key and the Deployments API are not used |
| D4 | **Deploys are branch-driven, not tag-driven** | `main@tag` support dropped. The head of a mapped branch *is* what that environment runs |
| D5 | No auth hardening | No login, no NextAuth, no org-membership gate. Run internally |
| D6 | No database | GitHub is the system of record; the app is a cached view. See §7 |
| D7 | Config is a JSON file in this repo | Changing it is a commit plus redeploy. No admin UI |
| D8 | No webhooks | Freshness comes from a 60s cache plus a manual Refresh button. One moving part instead of two |
| D9 | A shared password, checked in middleware | Not access control — the password ships in the bundle. It keeps the board off a passer-by's screen and stops signed-out requests costing GitHub calls |
| D10 | Branch graph scoped to configured branches | One repo has 1092 branches. Graphing all of them would be unreadable and slow; the pipeline is what matters |

Because of D3 and D4, "deployed to staging" means *the head commit of the branch
mapped to staging*. This is an inference, not an observation — see §5's note on the
`/__version` probe for when that inference breaks.

## 3. Views

Four views, one shared data model. Listed in screen order.

### 3.1 Right Now strip (pinned top)

The merge-to-green window is when a lead is watching, and a matrix is bad at showing
it. This gets its own band above everything else.

```
RIGHT NOW                                                3 active · 1 failed
----------------------------------------------------------------------------
[~] api-core     #482  fix rate limiter    @anurag   -> staging
                       build ######----  2m14s   ~1m left
[o] web-admin    #291  nav redesign        @priya    -> dev
                       queued 0:18
[x] ml-service   #77   retry logic         @sam      -> staging
                       failed at `pytest` - 40s ago - logs
----------------------------------------------------------------------------
  idle: auth-service, web-portal, shared-lib, +3
```

Rules:

- Failures stay pinned ~30 min after completion, then fall through to the matrix.
- Successes disappear on completion. An empty strip is the all-clear signal.
- Progress bar derives from the median duration of the last 20 successful runs of
  the same `workflow_id`.

**The merge-to-run gap.** The lifecycle has a hole:

```
PR merged --> push --> run queued --> in_progress --> completed
     |                     |
     +--- 5s to 2min ------+   no run exists yet
```

During that window GitHub has no `workflow_run` to report, so the strip shows
nothing and it looks like the merge did not register. The gap is detectable without
storing anything: compare the branch head SHA against the most recent run's
`head_sha`. If they differ, a push is awaiting CI.

If no run appears for a SHA within ~3 minutes, that is worth flagging as `no
workflow triggered` — it usually means path filters or `branches:` conditions
silently excluded the merge, which currently goes unnoticed for days.

*Not yet implemented.* The strip currently renders queued, running and
recently-failed runs. The gap row needs the branch-head comparison above.

**Stuck detection:**

- Run exceeds 2x its median duration -> `slow` badge.
- Queued longer than 5 minutes -> `runner starvation` badge. With nine repos sharing
  a runner pool this will happen; without the badge it just looks like a slow day.

### 3.2 Release matrix (primary view)

Rows = repos, columns = environments. Answers "what is where" at a glance.

```
PROJECT A (6 repos)          DEV            STAGING        PROD
----------------------------------------------------------------------
web-admin        (next)      a3f21c  ok     a3f21c  ok     9b02ee  ok   ^4
web-portal       (react)     7c1d90  FAIL   4e88ba  ok     4e88ba  ok
api-core         (node)      f20aa1  ok     f20aa1  ...    c71d33  ok   ^12
ml-service       (python)    22b7ef  ok     22b7ef  ok     22b7ef  ok
auth-service     (node)      --             8812cd  ok     8812cd  ok
shared-lib       (lib)       v2.4.0         v2.4.0         v2.3.1       ^1
```

- `^12` = commits merged to the repo's trunk but **not yet on that environment**.
  This is the number to stare at daily.
- Cell click -> the commits/PRs making up that gap.
- Failure click -> failing job and log link.
- `kind: library` / `kind: tooling` repos show merge state only, no env columns.
- Each env column also carries an inbound badge (`6>`) for open PRs targeting the
  mapped branch — see 3.4.

### 3.3 Branch promotion view

Deployment-independent. Answers "what is merged, how far has it travelled" for
gitflow-style repos.

```
PROJECT A                 develop -> release     release -> main
-------------------------------------------------------------------
web-admin                 ^0                     ^7   (!) 9 days
api-core                  ^3                     ^0
auth-service              ^0                     ^0
ml-service                ^14  (!)               ^2
```

One API call per pair:

```
GET /repos/{org}/{repo}/compare/release...develop
-> { ahead_by: 7, behind_by: 0, commits: [...] }
```

`ahead_by` arrives as a number — no commit walking. The commit list supplies the
drill-down. The age flag comes from the oldest commit in that list; a release branch
7 commits and 9 days behind is where releases go wrong, and age is the stronger
signal of the two.

### 3.4 Open PR queue

Distinct from `^N` drift. Drift is *merged, not deployed*; this is *not merged yet*.
Grouped by base branch.

```
OPEN PRs -> develop - api-core                                  6 open
-----------------------------------------------------------------------
#488  add retry backoff     @sam      2d    ok    approved      READY
#501  refactor db pool      @priya    4h    ...   no review     WAITING CI
#470  bump deps             @anurag   9d    ok    changes req   BLOCKED
#441  fix timezone          @kiran   21d    FAIL  approved      CONFLICTS
#455  wip: metrics          @sam     14d    --    draft         DRAFT
-----------------------------------------------------------------------
  2 ready to merge - 2 stuck - oldest 21d
```

Sort by actionability, not date. The question is "what can I merge right now," and
the answer should not require scanning.

**Status derivation** — three GitHub fields collapse to one verdict:

| `reviewDecision` | `mergeable` | checks | status |
|---|---|---|---|
| APPROVED | MERGEABLE | SUCCESS | READY |
| APPROVED | CONFLICTING | any | CONFLICTS |
| CHANGES_REQUESTED | any | any | BLOCKED |
| REVIEW_REQUIRED | MERGEABLE | SUCCESS | NEEDS REVIEW |
| any | any | PENDING | WAITING CI |
| any | any | FAILURE | CI FAILED |

`isDraft` short-circuits to DRAFT.

**Staleness:** non-draft PR open past 7 days flags; past 14 days it escalates to the
Right Now strip. Aging PRs rot invisibly once they fall off GitHub's first page.

---

## 4. Configuration

A YAML file in this repo, version controlled. Nine repos change rarely, and when
someone asks "why does staging point at `release/*` now?" the answer should be a
commit with a reviewer on it. A UI editor can come later if this becomes a chore.

```yaml
projects:
  - key: alpha
    name: "Project Alpha"
    org: copods
    environments: [dev, staging, prod]
    repos:
      - name: web-admin
        kind: frontend
        trunk: main
        branches:
          develop: dev
          release/*: staging          # globs required
          main: prod

      - name: ml-service
        kind: service
        trunk: main
        branches:
          main: dev                   # promoted via workflow_dispatch
          main@tag: prod              # prod cuts from tags

      - name: shared-lib
        kind: library
        trunk: main
        branches: {}                  # nothing deploys; merge state only

  - key: beta
    name: "Project Beta"
    org: copods
    environments: [staging, prod]
    repos:
      - name: qa-automation
        kind: tooling
        trunk: main
        track_runs: [nightly-suite, regression]   # test results, no envs
```

### What the branch map drives

Three jobs, not one:

1. **Drift reference.** `^12` must compare against the correct branch. In a gitflow
   repo `dev` is behind `develop`, not `main` — comparing against `main` reports
   nonsense.
2. **Environment inference fallback.** When a workflow does not set `environment:`,
   match the run's `head_branch` against the map. Native GitHub Environments wins
   whenever present, so repos can migrate to `environment:` one at a time without
   dashboard changes.
3. **Noise filter.** Branches absent from the map are recorded but hidden from the
   matrix. Without this, every `feat/xyz` run floods the view. One toggle reveals
   them when debugging.

### Config edge cases

- **Tag-based prod** — `main@tag` resolves the env reference to the latest matching
  tag rather than the branch head.
- **Wildcards** — `release/*` must glob. Nobody renames branches to suit a dashboard.
- **Ephemeral PR previews** — Vercel/Netlify fire a deployment per PR. Collapse into
  a single `preview` column with a count or the table floods.
- **Boot validation** — resolve every configured branch against the GitHub API at
  startup and fail loudly on a typo. An unresolvable branch silently reports `^0`,
  which reads as "all good" and is the worst available failure mode.

---

## 5. Data sources

| Source | Provides | Transport |
|---|---|---|
| GitHub GraphQL | open PR state (review + mergeable + checks) | poll, 2 min |
| GitHub REST | compare/ahead_by, job detail, logs | on demand |
| Service `/__version` | what is **actually running** | poll, phase 3 |

### GitHub Environments

If a deploy job carries `environment:`, GitHub fires `deployment` and
`deployment_status` on its own and populates the Deployments API. One line per job:

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production        # <- this
    steps:
      - uses: actions/checkout@v4
      - run: ./deploy.sh
```

The resulting payload is nearly a row in `deployments`:

```json
{
  "deployment":        { "sha": "a3f21c", "environment": "production" },
  "deployment_status": { "state": "success", "log_url": "https://github.com/.../runs/123" }
}
```

No job-name parsing, no convention to police, plus approval gates for free. Where
this is adopted, ingestion is insert-and-render. Where it is not, fall back to the
branch map (section 4).

### Open PR state — use GraphQL

This matters. Over REST, `mergeable` / `mergeable_state` are **not** on the list
endpoint, only on `GET /pulls/{number}`. Nine repos x ~8 open PRs is ~70 calls per
refresh before review state and checks. GraphQL does it in one:

```graphql
query($org: String!) {
  organization(login: $org) {
    repositories(first: 20) {
      nodes {
        name
        pullRequests(states: OPEN, first: 50) {
          nodes {
            number title isDraft createdAt
            author { login }
            baseRefName
            mergeable
            reviewDecision
            commits(last: 1) {
              nodes { commit { statusCheckRollup { state } } }
            }
          }
        }
      }
    }
  }
}
```

`mergeable` may return `UNKNOWN` while GitHub computes it lazily — re-request those
on the next tick rather than rendering `UNKNOWN`.

### The `/__version` probe (phase 3)

`deployment_status: success` means *the deploy job exited 0*. It does not mean
production is serving that SHA. Crash-loops, console rollbacks, and unpurged CDNs
never reach GitHub.

```
GET /__version  ->  { "sha": "a3f21c", "builtAt": "...", "env": "prod" }
```

Frontends bake the SHA into `/version.json` at build time. With this, "deployed" is
observed rather than assumed. Roughly: Actions data covers ~85% of the dashboard;
the probe covers the 15% that causes the 11pm "is the fix live or not?" conversation.

Deliberately deferred — ship the Actions-only matrix, observe how often CI and
reality disagree, then decide.

---

## 6. Data model

Five tables. Everything on screen derives from them.

```
projects      (id, key, name, github_org)

repos         (id, project_id, name, kind, trunk, config_json)
              kind: service | frontend | library | tooling

environments  (id, project_id, name, rank)

commits       (sha, repo_id, pr_number, title, author, merged_at)

deployments   (id, repo_id, env_id, sha, status, source,
               started_at, finished_at, ci_run_url)
              status: queued | in_progress | success | failure | unknown
              source: ci | probe

pull_requests (id, repo_id, number, title, author, base_ref, head_sha,
               is_draft, review_decision, mergeable, checks_state,
               created_at, merged_at, closed_at)
```

Derived, not stored:

- `^N` drift = count of `commits` after the SHA of the latest successful
  `deployment` for that (repo, env).
- Right Now strip = `deployments` where status in (queued, in_progress), plus
  failures within 30 min.
- PR queue = `pull_requests` where `merged_at is null and closed_at is null`,
  grouped by `base_ref`.

---

## 7. Architecture

```
browser ──> /[project] (dynamic) ──> getCachedProjectData ──> GitHub REST + GraphQL
                 ^                     (unstable_cache, 60s, tagged)
                 |
     Refresh button ──server action──> updateTag(project:<key>)
```

### Caching

One cache entry per project, 60s, tagged `project:<key>`. It wraps the *data*
fetch, not the page render. That choice matters twice: the page stays dynamic, and
per-request clocks (elapsed timers, PR ages) stay live instead of freezing at
whatever the cached render said.

A full refresh is ~37 calls. At 60s that is ~2,200/hr against a 5,000/hr floor.

### Freshness

The Refresh button runs a server action that calls `updateTag`, expiring the entry
so the following render refetches. `updateTag` rather than `revalidateTag` because
server actions need read-your-own-writes — the refresh must see fresh data, not the
entry it just expired.

A 20s interval re-renders without refetching. That keeps timers moving at no API
cost, since the data underneath is at most 60s old anyway.

No webhooks. With no database there is nothing to write, so a webhook's only job
would be dropping the cache marginally sooner than the button already does. Not
worth a second moving part and an HMAC secret for nine repos.

### Auth

One GitHub App installed org-wide. Scopes: `actions:read`, `deployments:read`,
`contents:read`, `pull_requests:read`, `checks:read`.

Org-wide install means new repos appear automatically instead of being wired one by
one. A GitHub App also gets 15k req/hr against a PAT's 5k, and survives the
installer leaving the org — which a PAT does not.

---

## 8. Known gotchas

Collected in one place because each one has a misleading failure mode.

| # | Gotcha | Handling |
|---|---|---|
| G1 | ~~Webhook redelivery~~ | N/A — no webhooks, nothing is inserted |
| G2 | A PR silently becomes conflicted | Caused by *another* PR merging. Nothing notifies us; the 60s refetch picks it up, and Refresh forces it |
| G3 | `mergeable` returns `UNKNOWN` | Computed lazily; retry next tick, never render UNKNOWN |
| G4 | `mergeable` absent from REST list endpoint | Use GraphQL (section 5) |
| G5 | Deploy success != running | `/__version` probe, phase 3 |
| G6 | Unresolvable configured branch | Reports `^0`, reads as healthy. Validate at boot, fail loudly |
| G7 | Merge with no triggered run | Path/branch filters excluding it. Flag after 3 min |
| G8 | Feature-branch run noise | Hide branches absent from the map; toggle to reveal |
| G9 | PR preview deployment flood | Collapse to one `preview` column with a count |
| G10 | Unknown project URL returns 200, not 404 | Documented Next behaviour once streaming starts. Page content is correct; status is not. Fix is `global-not-found.js` if ever needed |

G2 deserves emphasis: the board can show two PRs as READY when merging the first
has already broken the second. Polling closes this within a minute, where an
event-driven design would never hear about it at all — GitHub sends no event when a
PR becomes conflicted.

---

## 9. Stack

- **Next.js 16 (App Router)** — server components fetch directly; no API layer.
- **Octokit** — REST for branches/compare/runs, GraphQL for the PR queue.
- **No database, no ORM, no cron.** See §7.
- **Host** — anywhere Next runs. Vercel is fine now that nothing needs a long-lived
  process.

---

## 10. Phasing

Each phase is independently useful. Do not start the next until the previous is in
daily use.

### Phase 1 — Merge visibility (~1 week)

- Config file + loader, with loud surfacing of unresolvable branches (G6)
- Token in env; lazily constructed client so a missing token fails readably
- Release matrix with drift via `compare`
- Open PR queue via a single GraphQL call
- Right Now strip from `actions/runs`

Exit: the matrix is correct for all 9 repos and someone other than the author opens
it unprompted.

### Phase 2 — CI state (~1 week)

- `workflow_job`, `deployment_status`, `check_suite` ingestion
- Right Now strip, including the merge-to-run gap row and the 3-minute no-run flag (G7)
- Failure drill-down to job + logs
- Median-duration baseline, slow and queued badges
- Open PR queue via GraphQL, with the status derivation table and G2 re-query

Exit: a failed deploy is noticed here before it is noticed in Slack.

### Phase 3 — Ground truth (~3 days)

- `/__version` endpoint in each service; `/version.json` for frontends
- Probe poller, `source: probe` deployments
- Surface CI-vs-reality disagreement explicitly

Exit: the matrix is trusted without cross-checking the AWS console.

### Phase 4 — Opportunistic

- Slack alert on deploy failure and on drift past N commits
- DORA-adjacent metrics — lead time, change failure rate, deploy frequency. These
  fall out of the existing schema almost free.
- Config editing in the UI, if YAML-by-PR has become a chore.

---

## 11. Resolved

All five opening questions were answered on 2026-10-29 and are recorded in §2.

Still open, and both are yours to call:

- **`web-elbe-ai` trunk is `testing`.** The data says `staging` is 14 commits
  *ahead* of it, so the dev column measures as a permanent zero and tells you
  nothing. If `staging` is where work actually lands, trunk should be `staging`
  and the dev column should read `—`.
- **Conditional requests (ETags).** GitHub does not count `304 Not Modified`
  against the rate limit, so polling unchanged data is free. That would make a
  10s refresh viable where 60s is the current ceiling.

Remaining judgement calls, none blocking:

1. **Glob ordering.** `release/*` resolves to the lexicographically greatest match.
   That breaks at `release/1.10.0` vs `release/1.9.0` unless versions are zero
   padded. Revisit if release branches become common.
2. **Probe (phase 3).** D3/D4 mean the matrix *infers* what is deployed from branch
   heads. A rollback or a crash-looping container will not show. Worth adding only
   once that has actually bitten.
3. **Storage for metrics (phase 4).** DORA numbers need history the API does not
   retain cheaply. That is the one feature that would reverse D6.
4. **Back-merges.** The graph showed 25 of 70 commits on FMA-Node-Service are not
   in `develop`, because `staging → main` merges are never merged back down.
   Harmless for merge commits, but it means trunk is not a superset of prod, and
   a hotfix landed directly on `main` would be invisible to every other view.
