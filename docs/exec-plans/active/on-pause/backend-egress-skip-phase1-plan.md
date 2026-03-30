# Backend Egress Skip Phase 1 Plan

Status: `on-pause`  
Owner: `Codex / David`  
Last updated: `2026-03-30`

## Purpose

Track the first concrete implementation slice from the broader backend egress skip candidates plan.

Parent reference:
- [backend-egress-skip-candidates-plan.md](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/docs/exec-plans/active/on-pause/backend-egress-skip-candidates-plan.md)

This child plan intentionally starts with the safer backend cuts plus one medium-impact hot-path cleanup. It does **not** start with the riskiest recovery/sync reductions.

## Scope

a1) [have] This Phase 1 plan covers:
- trigger-path pre-maintenance reduction
- transcript revalidate seeding removal/downshift
- `refresh_video_attempts` persistence removal
- subscription-notice cleanup removal

a2) [todo] This Phase 1 plan does **not** cover:
- worker stale-recovery redesign
- `all_active_subscriptions` breadth reduction
- lease-heartbeat thinning
- `latest-mine` churn reduction

## Why This First

b1) [have] These cuts target backend work that is:
- maintenance-heavy
- support-table heavy
- hot-path waste on suppressed runs

b2) [have] They should produce measurable savings without directly weakening:
- job recovery behavior
- subscription sync coverage
- visible queue freshness

b3) [have] This is the smallest credible first slice from the broader tracker.

## Implementation Steps

c1) [todo] **Step 1: trim `/api/ingestion/jobs/trigger` so maintenance does not run before enqueue eligibility is known**
Primary file:
- [opsHandlers.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/handlers/opsHandlers.ts)

Current issue:
- the trigger path currently runs several maintenance actions before it knows whether enqueue will be:
  - blocked by an existing queued/running job
  - suppressed by the min-interval gate
  - suppressed by queue pressure

Change:
- move low-value maintenance behind the enqueue-eligibility checks
- keep the enqueue contract itself unchanged

Goal:
- stop paying maintenance cost on trigger calls that would have exited early anyway

Risk:
- low-medium

c2) [todo] **Step 2: remove automatic transcript revalidate seeding from the trigger route**
Primary files:
- [opsHandlers.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/handlers/opsHandlers.ts)
- [server/index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)

Current issue:
- `seedSourceTranscriptRevalidateJobs(...)` is maintenance work triggered from `/api/ingestion/jobs/trigger`

Change:
- stop calling transcript revalidate seeding from the trigger route
- leave the helper intact initially for future manual/ops use if needed

Goal:
- remove low-value support/repair work from the hot trigger path

Risk:
- low

c3) [todo] **Step 3: remove `refresh_video_attempts` persistence from the subscription refresh flow**
Primary file:
- [server/index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)

Current issue:
- failed refresh candidates currently write/read/delete support-table rows in `refresh_video_attempts`

Change:
- remove or bypass:
  - `markRefreshVideoFailureCooldown(...)`
  - `clearRefreshVideoFailureCooldown(...)`
  - `fetchActiveRefreshCooldownRows(...)`

Goal:
- eliminate support-table churn that is not required for core correctness

Risk:
- low-medium

c4) [todo] **Step 4: skip subscription-notice cleanup writes**
Primary files:
- [server/index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)
- [sourceSubscriptionsHandlers.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/handlers/sourceSubscriptionsHandlers.ts)
- [sourcePagesHandlers.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/handlers/sourcePagesHandlers.ts)

Current issue:
- `cleanupSubscriptionNoticeForChannel(...)` does source-item lookup + feed-item delete cleanup for a polish-only path

Change:
- stop calling this cleanup path from the normal flow
- keep the helper in place initially unless dead-code cleanup is trivial

Goal:
- remove low-value cleanup writes/lookups

Risk:
- low

c5) [todo] **Step 5: keep only one medium-impact trigger-path cleanup beyond the fully safe cuts**
Primary file:
- [opsHandlers.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/handlers/opsHandlers.ts)

Change:
- if any maintenance remains in `/api/ingestion/jobs/trigger`, keep only the highest-value piece
- defer or skip the rest on suppressed runs

Goal:
- capture one meaningful hot-path reduction without touching the riskier worker/subscription mechanics yet

Risk:
- medium, but contained

## Files Expected To Change

d1) [todo] Expected primary edits:
- [opsHandlers.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/handlers/opsHandlers.ts)
- [server/index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)
- [sourceSubscriptionsHandlers.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/handlers/sourceSubscriptionsHandlers.ts)
- [sourcePagesHandlers.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/handlers/sourcePagesHandlers.ts)

d2) [todo] Secondary edits only if needed:
- targeted tests in [src/test](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/test)

## Verification

e1) [todo] Run:
- `npm run typecheck`
- targeted backend tests for:
  - ingestion trigger route behavior
  - subscription refresh flows
  - touched cleanup/helper behavior

e2) [todo] Deploy and verify:
- Oracle backend smoke
- public release smoke

e3) [todo] Compare request history after soak:
- `ingestion_jobs`
- `claim_ingestion_jobs`
- support-table activity tied to `refresh_video_attempts`
- any exact shapes tied to `/api/ingestion/jobs/trigger`

e4) [todo] Product sanity checks:
- subscription refresh trigger still works
- normal generation enqueue still works
- no obvious browse/generation regression appears

## Exit Criteria

f1) [todo] Phase 1 is complete when:
- the four safe cuts are implemented
- verification passes
- no clear product regression appears
- request history shows at least some reduction in trigger/support-table waste

## Next Step After Phase 1

g1) [have] The next implementation after this plan should be the medium-impact pass from the parent tracker:
- worker stale-recovery cadence
- `all_active_subscriptions` breadth
- `latest-mine` churn
