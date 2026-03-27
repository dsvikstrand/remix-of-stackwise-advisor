# Backend Write Policy Plan

Status: `active`

## Goal
a1) [todo] Reduce Supabase backend churn by removing or coarsening background bookkeeping writes that do not materially affect user-visible state, correctness, recovery, or operations.

a2) [todo] Apply the guiding rule consistently:
- do not persist background bookkeeping unless it changes user-visible state, correctness, recovery, or operations in a meaningful way

## Why This Is Active Now
b1) [have] Fresh `24h` request history shows frontend/browser activity is already quiet, while backend/system churn still dominates.

b2) [have] The hottest proven backend paths are:
- `user_source_subscriptions?id=eq.:uuid`
- `rpc/claim_ingestion_jobs`
- `ingestion_jobs`
- `blueprint_youtube_refresh_state`
- `generation_run_events`
- `source_item_unlocks`

b3) [have] The strongest immediate write-policy mismatch is now in per-row background maintenance rather than frontend refetch behavior.

b4) [have] This plan is a lower-risk, higher-ROI near-term follow-up than a broader per-creator subscription redesign.

## Core Mantra
c1) [have] The default policy test for a backend write is:
- does it change user-visible state?
- does it protect correctness?
- does it improve recovery after failure/restart?
- does it materially improve operations visibility?

c2) [have] If the answer is mostly `no`, the write is a candidate to:
- skip
- coarsen
- batch
- move to shared state
- replace with derived state

## Audit Findings
d1) [have] [`sourceSubscriptionSync.ts`](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/sourceSubscriptionSync.ts) is the clearest first target.
- [`SUBSCRIPTION_SYNC_WRITE_HEARTBEAT_MINUTES`](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/sourceSubscriptionSync.ts#L68) is currently `15`
- [`buildSubscriptionSyncSuccessUpdate(...)`](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/sourceSubscriptionSync.ts#L97) still writes when only the heartbeat is stale
- the write lands in [`syncSingleSubscription(...)`](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/sourceSubscriptionSync.ts#L601)

d2) [have] Live production cadence is stricter than the runbook example.
- Oracle cron currently triggers `/api/ingestion/jobs/trigger` every `3m`
- enqueue path lives in [`handleIngestionJobsTrigger(...)`](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/handlers/opsHandlers.ts#L10)
- `all_active_subscriptions` processing lives in [`processAllActiveSubscriptionsJob(...)`](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts#L7280)

d3) [have] Queue control-plane traffic is the second major target.
- claim RPC wrapper: [`claimQueuedIngestionJobs(...)`](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/ingestionQueue.ts#L56)
- lease heartbeat wrapper: [`touchIngestionJobLease(...)`](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/ingestionQueue.ts#L76)
- queue worker idle cadence is defined in [`queuedIngestionWorkerController.ts`](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/queuedIngestionWorkerController.ts#L60)
- runtime defaults are defined in [`index.ts`](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts#L361)

d4) [have] [`blueprintYoutubeComments.ts`](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/blueprintYoutubeComments.ts) has clean no-op bookkeeping candidates.
- refresh-state upsert helper: [`upsertRefreshState(...)`](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/blueprintYoutubeComments.ts#L390)
- source-item metadata updater: [`storeSourceItemViewCount(...)`](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/blueprintYoutubeComments.ts#L335)
- the current implementation always writes `view_count_fetched_at`, even if `view_count` is unchanged

d5) [have] [`generationTrace.ts`](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/generationTrace.ts) is mostly intentional trace/audit data, not heartbeat noise.

d6) [have] [`sourceUnlocks.ts`](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/sourceUnlocks.ts) is mostly correctness-critical state and is not the first place to cut writes.

## Scope Lock
e1) [todo] Keep this plan focused on write-policy and cadence reduction inside the current architecture.

e2) [todo] Prefer low-risk changes first:
- skip no-op writes
- widen heartbeat windows
- reduce idle polling cadence
- avoid no-op metadata refreshes

e3) [todo] Do not widen this plan into:
- a per-creator subscription model redesign
- broad schema replacement
- frontend aggregation work
- CDN or cache-layer changes

## Safety Rules
f1) [todo] Preserve correctness-critical state transitions.

f2) [todo] Preserve recovery-critical fields when the worker or app needs them after restart.

f3) [todo] Prefer additive policy gates over schema changes in the first pass.

f4) [todo] Change one hotspot family at a time and re-measure after each pass.

f5) [todo] Keep user-visible behavior unchanged unless the product explicitly accepts a weaker freshness contract.

## Ranked Targets
g1) [have] Target 1: `user_source_subscriptions`
- classify each write as checkpoint/title/error/heartbeat
- remove or coarsen heartbeat-only writes
- review whether `last_polled_at` must remain per-row

g2) [have] Target 2: queue claim + lease cadence
- review low-priority polling cadence
- review idle keepalive backoff
- review whether the live `*/3` cron for `all_active_subscriptions` is stricter than needed

g3) [have] Target 3: `blueprint_youtube_refresh_state` and `source_items` refresh metadata
- skip no-op view-count writes
- avoid upserts whose only effect is `updated_at`

g4) [todo] Target 4: second-pass review of `source_item_unlocks`
- inspect for duplicate transcript-state writes only after the first three targets are measured

g5) [todo] Target 5: optional later review of `generation_run_events`
- only if trace volume becomes a proven quota problem

## Phase 1 Audit Lock
h0) [have] Phase 1 is locked as an audit-only pass. No runtime, schema, cron, or frontend behavior changes are part of this phase.

h01) [have] Canonical policy table for the current hot write paths:

| path/table | current trigger | why it writes today | policy class | recommended action | risk | proof metric |
| --- | --- | --- | --- | --- | --- | --- |
| `user_source_subscriptions` | `all_active_subscriptions` sync loop; heartbeat threshold `15m`; live Oracle cron every `3m` | persists checkpoint/title/error changes plus heartbeat-only `last_polled_at` refreshes | `[reduce]` | reduce or remove heartbeat-only writes that only refresh `last_polled_at`; keep checkpoint/title/error writes intact | `medium` | `user_source_subscriptions?id=eq.:uuid` request count vs current `~18,115 / 24h` baseline |
| `rpc/claim_ingestion_jobs` | queue worker idle/keepalive sweep across priority tiers | repeatedly asks whether queued work exists, even when the queue is mostly idle | `[reduce]` | review idle polling cadence and low-priority sweep frequency before changing lease safety | `medium` | `rpc/claim_ingestion_jobs` request count vs current `~12,174 / 24h` baseline |
| `rpc/touch_ingestion_job_lease` | running-job lease heartbeat | preserves worker ownership and recovery-safe lease extension for active jobs | `[keep]` | preserve for now; only reconsider cadence after claim chatter is tuned | `high` | no increase in stale lease / worker health failures after any later queue tuning |
| `blueprint_youtube_refresh_state` | auto/manual YouTube refresh bookkeeping | persists due-at, status, cooldown, failure-count, and timestamp updates | `[reduce]` | skip no-op upserts whose only effect is timestamp churn or unchanged state | `low` | drop in `blueprint_youtube_refresh_state` writes without refresh regressions |
| `source_items.metadata view_count` | YouTube refresh view-count fetch | writes `view_count` and `view_count_fetched_at`, even when the count is unchanged | `[reduce]` | skip writes when `view_count` is unchanged; only persist when data meaningfully changes | `low` | lower `source_items` metadata writes during view refresh cycles |
| `source_item_unlocks` | unlock reservation / processing / transcript retry state | persists real availability, reservation, retry, and terminal transcript state transitions | `[keep]` | preserve current semantics in the first pass | `high` | no unlock-state regression; no new stuck reservation / transcript-state bugs |
| `generation_run_events` | generation trace logging | records stepwise run trace/audit events for debugging and ops | `[keep]` | leave for later unless it becomes a proven quota hotspot | `medium` | no action in first pass; monitor only |

h02) [have] First-pass policy table result:
- `[reduce]`: `user_source_subscriptions`, `rpc/claim_ingestion_jobs`, `blueprint_youtube_refresh_state`, `source_items.metadata view_count`
- `[keep]`: `rpc/touch_ingestion_job_lease`, `source_item_unlocks`, `generation_run_events`
- `[remove]`: none locked in Phase 1
- `[rethink]`: none locked in Phase 1

h03) [have] Locked target order for the next implementation pass:
1. `user_source_subscriptions`
2. queue claim / lease cadence
3. YouTube refresh-state + unchanged view-count writes

h04) [have] Locked live cadence facts:
- Oracle ingestion cron currently triggers `/api/ingestion/jobs/trigger` every `3m`
- effective `all_active_subscriptions` enqueue minimum interval is now `10m`
- subscription success-path heartbeat threshold is `15m`
- repeated-identical subscription error heartbeat threshold is `30m`
- worker lease default is `90s`
- configured worker heartbeat default is `10s`
- effective worker heartbeat is derived from lease and configured heartbeat
- queue keepalive idle backoff defaults are `15s` base and `60s` max
- YouTube refresh scheduler default is `10m`

h05) [have] Locked Phase 2 implementation contract:
- may change heartbeat threshold and success-update gating in subscription sync
- may not change subscription product semantics
- may not redesign to per-creator shared polling
- may not change frontend behavior or docs outside the active plan unless freshness checks require it
- should treat `user_source_subscriptions` as the first implementation target before queue cadence or refresh-state work

## Phases
h1) [have] Phase 1: lock the audit and policy table.
- record each hot path as `[keep]`, `[reduce]`, `[remove]`, or `[rethink]`
- confirm the first implementation target order
- capture current live cadence facts, including Oracle cron
- progress note:
  - the canonical Phase 1 policy table is now locked in this plan
  - target order is locked as `user_source_subscriptions` first, queue cadence second, YouTube refresh bookkeeping third
  - baseline proof metrics for later phases are:
    - `user_source_subscriptions?id=eq.:uuid` at roughly `18,115 / 24h`
    - `rpc/claim_ingestion_jobs` at roughly `12,174 / 24h`

h2) [have] Phase 2: implement the first `user_source_subscriptions` policy pass.
- reduce heartbeat-only writes
- keep checkpoint/title/error writes intact
- verify no subscription UX regression
- progress note:
  - successful subscription syncs no longer write rows just because `last_polled_at` is older than the `15m` heartbeat window
  - success-path writes are now limited to meaningful state changes:
    - checkpoint change
    - channel title change
    - clearing a stored sync error
  - repeated error-path heartbeat throttling remains unchanged in this phase
  - focused backend tests now cover stale-heartbeat success no-op behavior

h3) [have] Phase 3: implement queue control-plane cadence tuning.
- reduce idle claim chatter where safe
- preserve lease safety and queue responsiveness
- verify queue health remains correct
- progress note:
  - low-priority idle claim sweeps now back off more aggressively than the default worker idle cadence
  - the queue worker keeps the normal idle cadence for non-low-priority scopes
  - claimed-work resets remain unchanged, so real queue work still re-schedules quickly
  - `touch_ingestion_job_lease` semantics remain unchanged in this phase

h4) [have] Phase 4: implement YouTube refresh-state / view-count dedupe.
- skip unchanged `view_count` metadata writes
- reduce no-op refresh-state upserts
- verify manual/auto refresh UX still behaves correctly
- progress note:
  - `storeSourceItemViewCount(...)` now skips `source_items.metadata` writes when the fetched `view_count` is unchanged instead of rewriting only `view_count_fetched_at`
  - `upsertRefreshState(...)` now reads the current refresh row and skips no-op writes when the patch would not change any meaningful persisted field
  - manual and auto refresh semantics stay the same; this phase only removes bookkeeping-only writes

h5) [todo] Phase 5: measure and summarize.
- compare fresh `24h` request shape against the current baseline
- record wins and residual hotspots
- decide whether to continue with second-pass backend write work or resume backend aggregation

h6) [have] Phase 6: implement background subscription cadence tuning.
- add repo-enforced minimum interval gating for `all_active_subscriptions`
- widen repeated-identical subscription error heartbeat writes
- keep active-work queue behavior and lease semantics unchanged
- progress note:
  - `/api/ingestion/jobs/trigger` still runs from Oracle every `3m`, but backend enqueue now suppresses `all_active_subscriptions` when the latest activity is newer than the default `10m` gate
  - repeated identical subscription error writes now refresh at `30m` instead of `15m`
  - subscription product semantics and the frontend `60m` health window remain unchanged

## Acceptance Criteria
i1) [todo] `user_source_subscriptions` write volume is materially reduced without breaking subscription polling correctness.

i2) [todo] Queue control-plane request volume is bounded more tightly at idle without harming job responsiveness or recovery.

i3) [todo] YouTube refresh bookkeeping avoids obvious no-op writes.

i4) [todo] Fresh measurement shows backend churn shifted downward on at least one top hotspot family.

i5) [todo] The plan leaves the current product/runtime contract intact.

## Related Plans
j1) [have] Backend aggregation is paused and remains valid follow-up context:
- [backend-aggregation-plan.md](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/docs/exec-plans/completed/backend-aggregation-plan.md)

j2) [have] The broader egress history remains paused:
- [supabase-egress-reduction-plan.md](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/docs/exec-plans/completed/supabase-egress-reduction-plan.md)

j3) [have] TanStack Query tuning is completed:
- [tanstack-query-tuning-plan.md](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/docs/exec-plans/completed/tanstack-query-tuning-plan.md)
