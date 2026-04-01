# Oracle Control-Plane Migration Discovery Plan

Status: `active`  
Owner: `Codex / David`  
Last updated: `2026-03-31`

## Purpose

Define the controlled discovery and design work required before moving high-churn control-plane logic from Supabase-backed decisions toward Oracle-owned local state.

This plan is intentionally pre-migration. It does not authorize a full data migration or a one-shot queue rewrite. It establishes what should move first, what must stay durable in Supabase for now, and what operational safeguards are required before implementation.

## Current State

a1) [have] Oracle is already the single backend runtime, but Supabase still holds much of the hot control-plane decision surface.

a2) [have] The latest `24h` request snapshot is materially lower than earlier baselines, but the dominant remaining buckets are still control-plane heavy:
- `ingestion_jobs`: `2,730`
- `claim_ingestion_jobs`: `1,144`
- `user_source_subscriptions`: `665`

a3) [have] The app is still operating acceptably after the egress reductions, which means the next step can shift from more UX-cutting throttles to structural control-plane redesign.

a4) [have] Oracle now has `2G` swap configured and active, improving safety for the first migration phases on the current small-memory box.

a5) [have] The current subscription scheduler is not a fair round-robin because unchanged successful syncs do not reliably refresh `last_polled_at`, which can produce extreme detection delays.

## Goal

b1) [todo] Identify which current Supabase-backed control decisions should move to Oracle-local state first.

b2) [todo] Preserve durable product truth in Supabase during the first migration phases.

b3) [todo] Produce a concrete phased design for Oracle-owned control-plane state that:
- lowers Supabase control chatter
- improves fairness and freshness predictability
- preserves restart safety and rollback options

b4) [todo] Avoid a premature full database migration or queue-truth migration before the control-plane split is proven.

## Discovery Tracks

c1) [have] **Truth vs control-state inventory**
Primary files:
- [server/index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)
- [opsHandlers.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/handlers/opsHandlers.ts)
- [queuedIngestionWorkerController.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/queuedIngestionWorkerController.ts)
- [ingestionQueue.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/ingestionQueue.ts)
- [sourceSubscriptionSync.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/sourceSubscriptionSync.ts)

Outputs:
- explicit list of state that must remain durable truth
- explicit list of state that can move to Oracle-local SQLite
- explicit list of state that can be recomputed after restart

c2) [have] **Invariant and correctness contract**
Target:
- document the minimal rules the new control plane must preserve

Examples:
- no duplicate active claim for the same durable job
- subscription sync remains eventually complete
- manual refresh can preempt background work
- restart does not permanently lose durable user-facing work

c3) [have] **Fairness and latency audit**
Target:
- map the current causes of long subscription-detection lag
- validate which exact parts come from scheduling unfairness versus downstream pipeline latency

Outputs:
- sample of upload-to-detection lag
- explanation of current scheduler unfairness
- target expected delay bands for Oracle-owned scheduling

c4) [have] **Restart and durability review**
Target:
- decide which Oracle-local state must survive restart
- choose SQLite-backed vs in-memory state per control-plane concern

Outputs:
- restart behavior matrix
- durability rules for cursors, guards, cooldowns, and local claims

c5) [have] **Oracle resource and concurrency budget**
Target:
- define safe local scheduler intervals, concurrency, and queue depth for the current Oracle box

Inputs:
- Oracle memory headroom
- swap availability
- existing service footprint
- external provider/API rate expectations

c6) [have] **Rollback and dual-control design**
Target:
- define how the first migration slice can be enabled, observed, and reversed safely

Outputs:
- feature-flag or mode-switch approach
- fallback path back to Supabase-backed control decisions
- proof checks required before trusting Oracle-local state

## Proposed Tooling Direction

d1) [have] The likely Oracle-local control-plane stack is:
- `better-sqlite3`
- `kysely`
- `bree`
- `p-queue`
- `pino`
- OpenTelemetry packages

d2) [have] Phase 1 should use SQLite for control-plane state only, not for full product truth.

d3) [have] Supabase should remain the durable system of record during the first phases for:
- `user_source_subscriptions`
- `source_items`
- `user_feed_items`
- `source_item_unlocks`
- durable ingestion history

## Expected First Migration Slice

e1) [todo] The first migration slice should likely target:
- round-robin subscription scheduling state
- recent-run markers
- guard/admission cache state
- cooldown/suppression windows

e2) [todo] The first migration slice should explicitly avoid:
- full queue-truth migration
- full product-data migration
- large frontend behavior changes

e3) [todo] The first implementation design should aim to improve:
- fairness of subscription revisit order
- typical upload-to-detection latency
- Supabase control-plane read/write volume

## Verification

f1) [todo] Before implementation, produce:
- a state-inventory table
- an invariant list
- a restart/durability matrix
- a SQLite schema sketch
- a rollout/rollback sequence

f2) [todo] After the first migration slice eventually lands, compare:
- Supabase control-plane request families
- subscription freshness lag
- duplicate-claim behavior
- restart recovery behavior

## Exit Criteria

g1) [todo] This discovery plan is complete when:
- the Oracle control-plane boundary is defined clearly
- the first migration slice is scoped concretely
- required tooling is agreed
- durability and rollback rules are documented
- a follow-on implementation plan is ready to replace this discovery plan as the active root

## Step 1 Initial Inventory

### Durable Supabase Truth To Keep In Early Phases

h1) [have] **User subscription identity and product configuration**
- table/surface: `user_source_subscriptions`
- keep durable now:
  - `id`
  - `user_id`
  - `mode`
  - `source_channel_id`
  - `source_channel_title`
  - `source_page_id`
  - `is_active`
  - source identity/config fields used by user-facing subscription behavior
- reason:
  - this is product truth, not just scheduler state

h2) [have] **Subscription checkpoint truth**
- table/surface: `user_source_subscriptions`
- keep durable now:
  - `last_seen_published_at`
  - `last_seen_video_id`
  - `last_sync_error`
- reason:
  - these fields affect durable ingestion correctness and restart-safe dedupe
- note:
  - `last_polled_at` is a mixed field and is not a good long-term scheduling primitive in its current shape

h3) [have] **User-facing content truth**
- keep durable in Supabase:
  - `source_items`
  - `user_feed_items`
  - `source_item_unlocks`
  - blueprints and related product records
- reason:
  - these directly define what the user can see or act on

h4) [have] **Manual/user-visible cooldown truth that already gates behavior**
- keep durable now:
  - `blueprint_youtube_refresh_state.comments_manual_cooldown_until`
  - similar user-visible cooldown/state records
- reason:
  - these are tied to explicit product behavior and should survive restart

### Mixed State That Should Stay In Supabase For Now

i1) [have] **`ingestion_jobs` is currently both durable history and hot control plane**
- currently stores:
  - queue truth and history
  - `status`
  - `next_run_at`
  - `lease_expires_at`
  - `last_heartbeat_at`
  - `worker_id`
  - `payload`
  - `processed_count` / `inserted_count` / `skipped_count`
- read/write surfaces:
  - [ingestionQueue.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/ingestionQueue.ts)
  - [opsHandlers.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/handlers/opsHandlers.ts)
  - [index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)
- decision:
  - keep in Supabase in the first migration phases
- reason:
  - this is too coupled to correctness, retries, and recovery to move in the first slice

i2) [have] **Manual refresh / source unlock job status restore**
- surfaces:
  - `/api/ingestion/jobs/latest-mine`
  - `/api/ingestion/jobs/active-mine`
  - `useSourceUnlockJobTracker`
  - subscriptions-page refresh restore
- decision:
  - keep Supabase-backed for now
- reason:
  - this is smaller than the scheduler problem and still tied to durable user-facing flows

### Best Oracle-Local SQLite Candidates For The First Migration Wave

j1) [have] **`all_active_subscriptions` fair scheduling state**
- current problem:
  - `processAllActiveSubscriptionsJob(...)` orders by `last_polled_at`
  - unchanged successful syncs do not always refresh `last_polled_at`
  - this creates unfair revisit order and extreme lag
- move candidate:
  - per-subscription scheduler state such as:
    - `next_due_at`
    - `last_checked_at`
    - local fairness cursor / priority marker
- reason:
  - this is the clearest hot control-plane state with strong egress and freshness payoff

j2) [have] **`all_active_subscriptions` recent-run / min-interval gate**
- current source:
  - `opsHandlers.ts` reads recent `ingestion_jobs` to decide whether the trigger should suppress
- move candidate:
  - Oracle-local recent-run marker and retry-after state for this scope
- reason:
  - this is derived operational state, not durable product truth

j3) [have] **Duplicate-prevention guard cache for `all_active_subscriptions`**
- current source:
  - paired reads for queued/running and latest/recent job checks
- move candidate:
  - Oracle-local admission decision cache keyed by scope and recent scheduler activity
- reason:
  - this is one of the highest remaining exact request shapes

j4) [have] **Low-priority suppression and queue-admission hints**
- current source:
  - queue-depth reads and suppression checks before low-priority enqueue
- move candidate:
  - local suppression windows
  - recent queue-pressure decisions
  - queue-depth hint cache
- reason:
  - these decisions are derived and short-lived

j5) [have] **Round-robin and cadence metadata for subscription sync**
- move candidate:
  - local scheduler lane metadata
  - last scheduler tick state
  - starvation-prevention metadata
- reason:
  - Oracle should own fairness and cadence if it becomes the hot control plane

### Oracle-Local In-Memory Or Recomputable State

k1) [have] **Existing in-process cache examples already proving the pattern**
- current in-memory caches:
  - `autoUnlockEligibleUsersCache`
  - `autoUnlockQueueDepthCache`
- source:
  - [index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)
- read:
  - these are already Oracle-local and recomputable after restart

k2) [have] **Worker loop runtime state**
- current local-only state in `createQueuedIngestionWorkerController(...)`:
  - timer handles
  - `idlePollStreak`
  - `lastMaintenanceRunAt`
  - `queuedWorkerNextRunAt`
  - `queuedWorkerRequested`
- decision:
  - keep local and recomputable
- reason:
  - these are runtime mechanics, not durable truth

k3) [have] **Ephemeral per-process guard results**
- examples:
  - recent queue-depth results
  - low-priority suppression outcomes
  - temporary “already checked recently” markers
- decision:
  - prefer in-memory first unless restart durability is required

### Defer To Later Phases

l1) [have] **Lease ownership and heartbeat truth**
- current source:
  - `claim_ingestion_jobs`
  - `touch_ingestion_job_lease`
  - `lease_expires_at`
  - `last_heartbeat_at`
  - `worker_id`
- decision:
  - do not move in the first slice
- reason:
  - this is closer to real queue correctness than the scheduler fairness problem

l2) [have] **Full queue truth migration**
- current source:
  - `ingestion_jobs` as durable queue/history
- decision:
  - explicitly defer
- reason:
  - the first migration win should come from Oracle-owned scheduling and admission logic, not a one-shot queue rewrite

### First-Step Boundary

m1) [have] **Best first migration boundary**
- move first:
  - `all_active_subscriptions` scheduling fairness state
  - recent-run markers
  - guard/admission cache state
  - suppression/cadence metadata
- keep for now:
  - durable `ingestion_jobs`
  - subscription checkpoints
  - user-facing content tables

m2) [have] **Main Step 1 conclusion**
- the first Oracle migration slice should target the subscription scheduler and its hot derived control logic
- it should not start with queue-truth migration or product-data migration

## Step 2 Initial Invariant Contract

### Durable Truth And Checkpoint Safety

n1) [have] **User-facing durable truth must remain authoritative**
- until a later explicit migration phase, Oracle-local control state must not replace Supabase as the source of truth for:
  - subscription checkpoints
  - source/feed/unlock records
  - durable ingestion history

n2) [have] **Subscription checkpoints must remain monotonic**
- `last_seen_published_at` and `last_seen_video_id` must only advance when the new candidate is actually newer
- the scheduler may change how subscriptions are chosen, but it must not regress checkpoint truth

n3) [have] **User feed insertion must stay idempotent**
- the same user/source-item combination must not create duplicate visible feed rows
- current behavior relies on both:
  - read-before-insert checks
  - unique-violation tolerance on insert
- Oracle-local scheduling must preserve that effective at-most-once visible insertion behavior

### Queue And Admission Safety

o1) [have] **Low-priority suppression must never block high-priority user work**
- current priority contract treats:
  - `source_item_unlock_generation`
  - `manual_refresh_selection`
  - `search_video_generate`
  as high priority
- low-priority scopes such as:
  - `all_active_subscriptions`
  - `blueprint_youtube_refresh`
  - `blueprint_youtube_enrichment`
  may be suppressed under pressure
- Oracle-local admission logic must preserve this priority boundary

o2) [have] **At-most-one active durable claim owner remains required**
- while `ingestion_jobs` stays the durable queue truth, the system must preserve the existing single-claim/lease ownership model around:
  - `claim_ingestion_jobs`
  - `touch_ingestion_job_lease`
  - `worker_id`
  - `lease_expires_at`
- Oracle-local state may reduce reads and scheduling chatter, but it must not create duplicate durable job ownership

o3) [have] **Duplicate-prevention by dedupe key must survive migration**
- current examples:
  - one pending `source_auto_unlock_retry` per `source_item_id`
  - one pending `source_transcript_revalidate` per `unlock_id`
  - manual YouTube refresh avoids duplicate pending `comments` / `view_count` jobs
- Oracle-local control logic may cache or shortcut these checks, but it must preserve the same effective dedupe guarantees

o4) [have] **Guard caching may be stale, but not arbitrarily wrong**
- Oracle-local admission caches can trade some freshness for lower chatter
- they must not:
  - suppress explicit user-triggered work for long periods incorrectly
  - permit unbounded duplicate background enqueue storms
  - forget recent durable queue activity in a way that breaks basic queue sanity

### Restart And Recovery Safety

p1) [have] **Loss of Oracle-local state after restart must be acceptable by design**
- in-memory state such as:
  - timers
  - idle streaks
  - short-lived admission hints
  can be recomputed
- if losing a state item on restart would risk durable correctness or fairness continuity beyond an acceptable window, it belongs in local SQLite rather than RAM

p2) [have] **Restart must not lose durable user-visible work**
- after Oracle restart, the system must still be able to recover and continue using durable truth for:
  - queued/running user-visible jobs
  - subscription checkpoints
  - existing source/feed/unlock data

### Reservation And Side-Effect Safety

q1) [have] **Reservation/intent settlement must remain exactly-once in effect**
- current flows explicitly settle or release:
  - manual generation reservations
  - auto-unlock intents
- Oracle-local control changes must not strand reserved credits/intents or double-settle them during retries/restarts

q2) [have] **Manual refresh and explicit user-triggered actions keep priority over background freshness**
- current behavior already treats manual refresh and direct generation as more important than background sync
- the Oracle control plane must preserve that UX contract even if background scheduling becomes more live

### Step 2 Conclusion

r1) [have] **Main Step 2 conclusion**
- the first Oracle migration slice is safe only if it keeps:
  - durable queue truth in Supabase
  - checkpoint monotonicity
  - feed-item idempotency
  - high-priority user work precedence
  - restart-safe recovery for user-visible outcomes

## Step 3 Initial Fairness And Latency Audit

### Current Cadence And Coverage Envelope

s1) [have] **Current `all_active_subscriptions` cadence is roughly hourly**
- live `24h` sample:
  - `23` jobs in the last `24h`
  - started-job interval summary:
    - min: `1.00h`
    - median: `1.05h`
    - avg: `1.04h`
    - max: `1.05h`

s2) [have] **Current active YouTube subscription count is `191`**
- this remains the relevant coverage pool for subscription discovery

s3) [have] **A perfectly fair scheduler at the current breadth cap would be much faster than the delays we are seeing**
- current breadth cap in code: `75` subscriptions per run
- rough fair full-cycle math:
  - `191 / 75 = 2.55` runs
  - at `~1.04h` per run, a fair full revisit would be about `2.65h`
- rough fair latency implication:
  - common-case detect delay should be around `1-1.5h`
  - rough worst-case should be around `~2.5-3h`

### Measured Upload To Detection Lag

t1) [have] **Recent followed-before-upload sample shows much larger lag than the fair-cycle math**
- user sample size: `20` recent `my_feed_*` rows for the most active current feed user
- `upload -> user_feed availability` summary:
  - min: `0.06h`
  - median: `7.57h`
  - avg: `10.01h`
  - max: `21.02h`

t2) [have] **The delay is almost entirely `upload -> source_item detection`, not `source_item -> feed`**
- `upload -> source_item detection` summary:
  - min: `0.05h`
  - median: `7.57h`
  - avg: `10.01h`
  - max: `21.02h`
- `source_item detection -> user_feed availability` summary:
  - min: `0h`
  - median: `0h`
  - avg: `~0h`
  - max: `0.01h`

t3) [have] **For `my_feed_unlockable`, the same pattern holds**
- `upload -> user_feed`:
  - median: `11.19h`
  - avg: `10.54h`
  - max: `21.02h`
- `detect -> feed`:
  - effectively `0h`

t4) [have] **Interpretation**
- once the system creates the `source_item`, the feed/write path is nearly immediate
- the long delay is almost entirely in discovery/scheduling before detection

### Structural Cause

u1) [have] **The current scheduler uses a fairness proxy that is not a real “last checked” signal**
- `processAllActiveSubscriptionsJob(...)` orders by `last_polled_at`
- `buildSubscriptionSyncSuccessUpdate(...)` only writes `last_polled_at` when one of these changes:
  - checkpoint changes
  - channel title changes
  - previous error is cleared
- unchanged successful checks can therefore return `null` and avoid a write

u2) [have] **Why that matters**
- a true round-robin scheduler needs a stable “this subscription was actually checked” marker
- the current signal is partly:
  - product checkpoint state
  - write-throttling optimization
- not a clean scheduler truth

u3) [have] **Audit conclusion**
- the measured lag is too large to explain by downstream pipeline time
- the current hourly cadence alone also does not explain the observed `7-21h` detection delays under a fair scheduler
- the remaining gap is therefore primarily a scheduler/fairness/control-plane problem

### Current Snapshot Caveat

v1) [have] **Current `last_polled_at` ages are all under `6h` in the present snapshot**
- this means the current point-in-time distribution is not itself showing obviously stale rows right now
- but it does not overturn the structural problem above, because the audit lag sample is historical and the scheduling primitive still depends on a non-authoritative field

### Target Delay Bands For Oracle-Owned Scheduling

w1) [have] **Target design band for Oracle-owned subscription scheduling**
- active/recently posting channels:
  - typical detection target: `5-15 min`
- normal followed channels:
  - typical detection target: `15-30 min`
- quiet channels:
  - acceptable slower revisit windows

w2) [have] **Practical product target**
- common-case upload-to-detection should move from today’s `~7-10h` range down toward:
  - typical `<30 min`
- slower cases can still exist under:
  - provider failures
  - backpressure
  - deliberately deprioritized quiet channels

w3) [have] **Main Step 3 conclusion**
- the first Oracle-owned control-plane slice is justified not only by egress reduction
- it is also the cleanest path to remove the current discovery-side latency that dominates subscription freshness

## Step 4 Initial Restart And Durability Matrix

### Durability Rule

x1) [have] **Durability rule for the migration**
- keep anything user-visible or correctness-critical in durable truth first
- store scheduler continuity state in local SQLite when restart loss would cause unacceptable fairness regressions or bursty catch-up
- keep pure runtime mechanics and short-lived hints in memory only

### Keep In Supabase For Now

y1) [have] **Durable queue truth stays in Supabase in early phases**
- keep durable:
  - `ingestion_jobs.status`
  - `next_run_at`
  - `lease_expires_at`
  - `last_heartbeat_at`
  - `worker_id`
  - retry/error fields
- reason:
  - restart must not lose active durable job truth while the queue itself still lives in Supabase

y2) [have] **Reservation and billing settlement state stays in Supabase**
- keep durable:
  - manual generation reservations and their settle/release idempotency
  - `source_auto_unlock_intents`
  - participant funding status / release / settle markers
  - unlock reservation ownership on `source_item_unlocks`
- reason:
  - restart cannot be allowed to strand or double-spend credits/intents

y3) [have] **User-visible manual cooldowns stay in Supabase**
- keep durable:
  - `blueprint_youtube_refresh_state.comments_manual_cooldown_until`
  - related manual refresh timestamps / trigger attribution
- reason:
  - these directly affect user-visible behavior and should survive restart consistently

y4) [have] **Subscription checkpoints stay in Supabase**
- keep durable:
  - `last_seen_published_at`
  - `last_seen_video_id`
  - `last_sync_error`
- reason:
  - restart cannot risk reprocessing older content incorrectly or regressing dedupe truth

### SQLite-Durable Oracle-Local State

z1) [have] **Subscription scheduler state should be SQLite-durable**
- best first durable local table contents:
  - `subscription_id`
  - `next_due_at`
  - `last_checked_at`
  - `last_scheduler_result`
  - starvation/fairness metadata if needed
- reason:
  - losing this on restart would recreate bunching, unfairness, and inconsistent revisit order

z2) [have] **Scope-level recent-run markers should be SQLite-durable**
- examples:
  - last successful `all_active_subscriptions` scheduler run
  - last trigger-attempt / min-interval marker
  - last admission-decision window boundaries
- reason:
  - if lost on restart, Oracle may immediately over-trigger background sync and erase much of the control-plane gain

z3) [have] **Optional local suppression/cadence windows are SQLite-durable if they shape restart behavior materially**
- examples:
  - low-priority background suppression windows
  - per-scope cooldowns for background sweeps
- reason:
  - if the system restarting should not immediately unleash a burst of low-priority work, these windows need durable local storage

### In-Memory Only State

aa1) [have] **Worker timers and loop mechanics stay in memory**
- examples:
  - timer handles
  - `idlePollStreak`
  - `queuedWorkerNextRunAt`
  - local “requested rerun” flags
- reason:
  - these are runtime mechanics and are safely recomputed after restart

aa2) [have] **Short-lived queue-depth hint caches stay in memory**
- examples:
  - `autoUnlockQueueDepthCache`
  - recent queue-depth reads
  - recent eligible-user cache entries
- reason:
  - loss only causes extra reads or slightly rougher behavior briefly, not correctness loss

aa3) [have] **Admission-result caches can start in memory**
- examples:
  - recent “already running / recently queued” decisions
  - derived suppression booleans
- reason:
  - restart loss is acceptable if the fallback is conservative and durable queue truth still exists
- note:
  - if a specific cache proves important to avoid restart bursts, it can be promoted to SQLite later

### Not In Scope For Early Restart Migration

ab1) [have] **Local claim ownership is not a first-phase durability problem**
- because the first migration slice does not move durable queue truth off Supabase
- lease ownership and stale-job recovery remain anchored in Supabase until a later queue migration phase

ab2) [have] **Full local queue reconstruction is explicitly deferred**
- the first phases should rebuild only:
  - Oracle scheduler state
  - guard/cadence metadata
- not the full durable queue

### Restart Behavior Target

ac1) [have] **Acceptable restart behavior for Phase 1**
- after Oracle restart:
  - user-visible durable jobs still exist in Supabase
  - user-facing cooldowns and reservations still exist in Supabase
  - Oracle reloads local SQLite scheduler state
  - in-memory worker hints/timers rebuild naturally
- acceptable temporary degradation:
  - one short warm-up period for in-memory caches
- unacceptable outcomes:
  - duplicate durable claims
  - lost credit/intention settlement state
  - checkpoint regression
  - large background burst caused by forgetting scheduler continuity

ac2) [have] **Main Step 4 conclusion**
- the first Oracle-owned migration slice needs two local state tiers:
  - SQLite for scheduler continuity
  - memory for runtime hints
- while durable queue truth, reservations, cooldowns, and checkpoints remain in Supabase

## Step 5 Oracle Resource And Concurrency Budget

### Current Oracle Envelope

rc1) [have] **Current Oracle box is still small, so the scheduler budget must stay conservative**
- current host shape:
  - `~952 MiB` RAM
  - `2 GiB` swap
- observed backend footprint during the first Oracle control-plane phases:
  - roughly `108-152 MiB` `MemoryCurrent`
- implication:
  - the Oracle scheduler should stay lightweight and avoid introducing a burstier multi-lane sync model in the first phases

rc2) [have] **This migration slice does not increase actual subscription-sync concurrency**
- `processAllActiveSubscriptionsJob(...)` still loops subscriptions serially inside one durable job
- `all_active_subscriptions` still has effective active-run concurrency of `1`
- reason:
  - the current win comes from Oracle-owned scheduling fairness and admission continuity, not parallelizing per-channel sync work

### Safe Starting Budget

rd1) [have] **Keep the Oracle scheduler tick at the current `300000 ms` (`5 min`) default**
- source:
  - [oracleControlPlaneConfig.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/oracleControlPlaneConfig.ts)
- meaning:
  - this is the cadence reference for Oracle-local retry/suppression timing
- reason:
  - frequent enough for `<30 min` target freshness bands
  - conservative enough for the current small Oracle box

rd2) [have] **Keep the due-batch limit aligned to the current durable breadth cap**
- current Oracle due-batch default:
  - `ORACLE_SUBSCRIPTION_SHADOW_BATCH_LIMIT=75`
- current durable breadth cap:
  - `ALL_ACTIVE_SUBSCRIPTIONS_MAX_PER_RUN=75`
- reason:
  - Oracle-primary should not increase per-run breadth in the first phase
  - it should improve fairness first, not widen work volume

rd3) [have] **Keep current revisit targets as the first safe operating profile**
- active/recent channels:
  - `15 min`
- normal channels:
  - `30 min`
- quiet channels:
  - `90 min`
- error retry:
  - `15 min`
- reason:
  - these are already wired into the live Oracle scheduler config and are compatible with the current box and single-node design

rd4) [have] **Keep the durable min-trigger interval at `60 min` during the first primary soak**
- current source:
  - `ALL_ACTIVE_SUBSCRIPTIONS_MIN_TRIGGER_INTERVAL_MS`
- current default:
  - `60 min`
- reason:
  - the first Oracle-primary cut is proving correctness/fairness continuity, not full live-frequency expansion
- note:
  - once Oracle-primary proves stable, reducing the durable trigger interval becomes a separate tuning decision

rd5) [have] **Keep worker concurrency unchanged for this migration slice**
- current global worker default:
  - `WORKER_CONCURRENCY=2`
- decision:
  - do not raise worker concurrency as part of the Oracle scheduler rollout
- reason:
  - the control-plane migration should not confound scheduler gains with broader execution fan-out

### Operational Guardrails

re1) [have] **Treat these as immediate rollback or downgrade signals**
- repeated:
  - `primary trigger decision failed`
  - `primary_due_batch_fallback`
- health flapping or restart loops
- obvious duplicate `all_active_subscriptions` enqueue behavior

re2) [have] **Treat these as resource pressure warning thresholds**
- sustained backend memory materially above the current baseline, especially if it trends toward `~256 MiB+`
- sustained swap growth toward `~256 MiB+`
- unexpected CPU pressure coinciding with Oracle-primary scheduling
- action:
  - if these persist rather than spike briefly, revert to `shadow` and inspect before expanding the scheduler further

re3) [have] **Main Step 5 conclusion**
- the safe starting Oracle-primary budget is intentionally conservative:
  - `5 min` scheduler tick
  - `75` due-batch cap
  - unchanged global worker concurrency
  - unchanged durable `60 min` trigger interval
- this keeps the first primary phase focused on:
  - fairness
  - continuity
  - lower Supabase chatter
- not on aggressive throughput expansion

## Step 6 Initial SQLite Schema Sketch

### Schema Scope

ad1) [have] **Phase 1 SQLite should be intentionally narrow**
- it should support:
  - subscription scheduler continuity
  - scope-level recent-run markers
  - suppression / cadence continuity
- it should not yet store:
  - durable queue truth
  - user-facing product records
  - billing / reservation truth

ad2) [have] **Recommended storage location**
- use a persistent runtime path outside the git working tree
- example target:
  - `/home/ubuntu/agentic-runtime/control-plane.sqlite`
- reason:
  - deploys or repo cleanup should not risk local control-plane state

### SQLite Runtime Settings

ae1) [have] **Recommended SQLite pragmas**
- `journal_mode = WAL`
- `synchronous = NORMAL`
- `busy_timeout = 5000`
- `foreign_keys = ON`

ae2) [have] **Why**
- WAL improves concurrent reader/writer behavior for the single-node backend
- `NORMAL` keeps durability reasonable without paying the highest fsync cost on every write

### Proposed Tables

#### 1. `control_meta`

af1) [have] **Purpose**
- hold schema/runtime metadata for the local control plane

af2) [have] **Suggested columns**
```sql
CREATE TABLE control_meta (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

af3) [have] **Use cases**
- schema version
- last successful bootstrap time
- current scheduler mode flags

#### 2. `subscription_schedule_state`

ag1) [have] **Purpose**
- local scheduler continuity for each active subscription

ag2) [have] **Suggested columns**
```sql
CREATE TABLE subscription_schedule_state (
  subscription_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source_channel_id TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  priority_tier TEXT NOT NULL DEFAULT 'normal',
  next_due_at TEXT NOT NULL,
  last_checked_at TEXT,
  last_completed_at TEXT,
  last_result_code TEXT,
  consecutive_noop_count INTEGER NOT NULL DEFAULT 0,
  consecutive_error_count INTEGER NOT NULL DEFAULT 0,
  starvation_score INTEGER NOT NULL DEFAULT 0,
  scheduler_notes_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_subscription_schedule_due
  ON subscription_schedule_state (next_due_at);

CREATE INDEX idx_subscription_schedule_priority_due
  ON subscription_schedule_state (priority_tier, next_due_at);

CREATE INDEX idx_subscription_schedule_channel
  ON subscription_schedule_state (source_channel_id);
```

ag3) [have] **Notes**
- `subscription_id` remains the foreign lookup key back to durable Supabase truth
- `user_id` and `source_channel_id` are denormalized for local scheduling/debuggability
- this table is the core fix for today’s unfair `last_polled_at` behavior

ag4) [have] **What it replaces conceptually**
- not the Supabase checkpoint fields
- only the hot scheduler decision layer that currently abuses `last_polled_at`

#### 3. `scope_control_state`

ah1) [have] **Purpose**
- one durable row per scheduler/queue scope for recent-run and cadence continuity

ah2) [have] **Suggested columns**
```sql
CREATE TABLE scope_control_state (
  scope TEXT PRIMARY KEY,
  scheduler_enabled INTEGER NOT NULL DEFAULT 1,
  last_triggered_at TEXT,
  last_started_at TEXT,
  last_finished_at TEXT,
  last_success_at TEXT,
  min_interval_until TEXT,
  suppression_until TEXT,
  last_decision_code TEXT,
  last_queue_depth INTEGER,
  last_result_summary_json TEXT,
  updated_at TEXT NOT NULL
);
```

ah3) [have] **Use cases**
- `all_active_subscriptions` recent-run marker
- min-interval enforcement without rereading recent Supabase job rows every time
- background suppression continuity across restart

#### 4. `scope_admission_windows`

ai1) [have] **Purpose**
- optional durable windows for scope-level admission/suppression that should survive restart

ai2) [have] **Suggested columns**
```sql
CREATE TABLE scope_admission_windows (
  window_key TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  decision_code TEXT NOT NULL,
  effective_until TEXT NOT NULL,
  payload_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_scope_admission_scope_until
  ON scope_admission_windows (scope, effective_until);
```

ai3) [have] **When to use**
- keep this table only if restart-loss of suppression windows causes real burstiness
- if not needed, start with in-memory admission cache only and add this table later

### Tables Explicitly Deferred

aj1) [have] **Do not add in Phase 1**
- local durable queue table
- local lease ownership table
- local billing / reservation ledger
- local copy of `source_items` / `user_feed_items` / `source_item_unlocks`

aj2) [have] **Reason**
- those belong to later phases, after Oracle-owned scheduler state is proven

### Data-Flow Sketch

ak1) [have] **Phase 1 read/write shape**
- bootstrap:
  - load active subscriptions from Supabase
  - upsert minimal rows into `subscription_schedule_state`
- runtime scheduler:
  - select due rows from `subscription_schedule_state`
  - fetch durable subscription truth from Supabase only for the selected subscriptions
  - run sync
  - update:
    - `subscription_schedule_state`
    - `scope_control_state`
  - continue to write durable checkpoints/results back to Supabase as today

ak2) [have] **Restart behavior**
- on restart:
  - reload `scope_control_state`
  - reload `subscription_schedule_state`
  - rebuild in-memory timers and caches
  - continue using Supabase as durable job/product truth

### First-Slice Recommendation

al1) [have] **Minimal schema to implement first**
1. `control_meta`
2. `subscription_schedule_state`
3. `scope_control_state`

al2) [have] **Optional fourth table only if needed after testing**
4. `scope_admission_windows`

al3) [have] **Main Step 6 conclusion**
- the first SQLite schema can stay very small
- only `subscription_schedule_state` is truly central to the first migration win
- the rest exists to preserve cadence continuity and restart safety

## Step 7 Initial Rollout And Rollback Sequence

### Rollout Principles

am1) [have] **Use runtime modes and flags, not branch-specific behavior**
- the repo already uses env-driven runtime switches for major behavior
- the Oracle control-plane migration should follow the same model
- target config source:
  - `/etc/agentic-backend.env`

am2) [have] **Keep Supabase queue truth in place during the first migration slice**
- rollout should only shift scheduler/admission control for `all_active_subscriptions`
- it should not move durable queue truth, reservations, or user-visible product data in the same step

am3) [have] **Prefer shadow-first before Oracle becomes authoritative**
- first collect proof that Oracle-local scheduling decisions match expectations
- then promote Oracle-local scheduling to authority

### Proposed New Runtime Flags

an1) [have] **Recommended first-phase backend flags**
- `ORACLE_CONTROL_PLANE_ENABLED=false|true`
- `ORACLE_SUBSCRIPTION_SCHEDULER_MODE=supabase|shadow|primary`
- `ORACLE_CONTROL_PLANE_SQLITE_PATH=/home/ubuntu/agentic-runtime/control-plane.sqlite`
- `ORACLE_SUBSCRIPTION_BOOTSTRAP_BATCH=...`
- `ORACLE_SUBSCRIPTION_SCHEDULER_TICK_MS=...`
- `ORACLE_PRODUCT_MIRROR_ENABLED=false|true`
- `ORACLE_PRODUCT_BOOTSTRAP_LIMIT=...`

an2) [have] **Meaning**
- `supabase`
  - existing production behavior
- `shadow`
  - Oracle builds and updates local scheduler state but does not control enqueue decisions yet
- `primary`
  - Oracle-local scheduler state becomes the primary source for `all_active_subscriptions` scheduling/admission decisions

### Rollout Sequence

ao1) [todo] **Phase 0: package and storage prep**
- add:
  - `better-sqlite3`
  - `kysely`
  - `pino`
- create persistent runtime dir on Oracle:
  - `/home/ubuntu/agentic-runtime/`
- initialize SQLite file and schema
- leave runtime mode at:
  - `ORACLE_SUBSCRIPTION_SCHEDULER_MODE=supabase`

ao2) [todo] **Phase 1: bootstrap-only**
- on backend start:
  - load active YouTube subscriptions from Supabase
  - upsert rows into `subscription_schedule_state`
  - initialize `scope_control_state`
- do not change live scheduling decisions yet
- success condition:
  - SQLite state is populated and stable across restart

ao3) [have] **Phase 2: shadow mode**
- switch to:
  - `ORACLE_SUBSCRIPTION_SCHEDULER_MODE=shadow`
- Oracle computes:
  - due subscriptions
  - next due times
  - scope-level scheduler decisions
- but Supabase-backed production trigger/admission still remains authoritative
- log comparison signals:
  - due-count mismatch
  - fairness gap
  - projected lag improvements

ao4) [have] **Phase 3: Oracle-primary scheduling for `all_active_subscriptions` only**
- switch to:
  - `ORACLE_SUBSCRIPTION_SCHEDULER_MODE=primary`
- Oracle becomes authoritative for:
  - which subscriptions are due
  - when the next scheduler run should happen
  - recent-run suppression/min-interval continuity
  - external trigger ownership for `all_active_subscriptions`
  - Oracle-primary due-batch drain size via `ORACLE_SUBSCRIPTION_PRIMARY_BATCH_LIMIT`
- Supabase still remains authoritative for:
  - durable queue rows
  - subscription checkpoints
  - user-facing writes

ao5) [have] **Phase 4: stabilize and measure**
- let the system soak
- compare:
  - Supabase control-plane request families
  - upload-to-detection lag
  - queue duplication/stale-claim behavior
  - restart recovery after a deliberate backend restart
 - current live baseline:
  - Oracle `primary` is active on production
  - cadence is reduced from `60m` to `30m`
  - no `primary_due_batch_fallback` has been observed in the initial soak windows

### Verification Gates

ap1) [have] **Phase 1 gate**
- SQLite file exists and survives restart
- active subscription rows populate correctly
- no change in user-visible behavior

ap2) [have] **Phase 2 gate**
- Oracle shadow scheduler produces sane due ordering
- no restart burst from forgotten local continuity
- logs show stable shadow decisions for multiple cycles

ap3) [have] **Phase 3 gate**
- `all_active_subscriptions` still runs correctly
- no duplicate durable queue rows from scheduler handoff
- subscription freshness improves materially
- Supabase control-plane chatter drops for the targeted shapes

### Primary Monitoring Checklist

ap4) [todo] **Health and service stability**
- local Oracle `/api/health` stays `{"ok":true}`
- public API `/api/health` stays `{"ok":true}`
- `agentic-backend.service` remains `active`
- no restart loop or repeated failed restart window

ap5) [todo] **Runtime mode and release sanity**
- deployed backend SHA stays on the intended release
- `ORACLE_SUBSCRIPTION_SCHEDULER_MODE=primary`
- `ORACLE_CONTROL_PLANE_ENABLED=true`
- SQLite path remains the expected persistent runtime path

ap6) [todo] **Primary decision logs appear cleanly**
- expect:
  - `[oracle-control-plane] primary_trigger_decision`
- good signs:
  - `matched=true`
  - expected `actual_decision_code`
- bad signs:
  - `primary trigger decision failed`

ap7) [todo] **Primary batch selection works**
- expect:
  - `[oracle-control-plane] primary_due_batch_selected`
- good signs:
  - reasonable `selected_count`
  - no obvious missing-row drift
- bad signs:
  - `primary_due_batch_fallback`

ap8) [todo] **First real primary enqueue completes cleanly**
- confirm one eligible post-cutover trigger produces:
  - `actual_enqueued`
  - a normal `all_active_subscriptions` job
  - clean `unlock_job_terminal` / `unlock_job_finished` logs
- confirm no duplicate enqueue burst around the handoff

ap9) [todo] **Subscription freshness remains acceptable**
- followed-channel uploads still appear normally
- no obvious missed pickups
- compare another upload-to-detection sample after the first `24h`

ap10) [todo] **Resource usage stays sane**
- monitor service memory and swap use
- check for unexpected CPU pressure if Oracle becomes busier
- treat sustained upward drift as a rollback signal

ap11) [todo] **Suggested monitoring cadence**
- first eligible enqueue window after cutover
- `1-2h` short soak check
- `6-12h` stability check
- `24h` verdict with request-family and freshness comparison

### Rollback Sequence

aq1) [have] **Fast rollback**
- set:
  - `ORACLE_SUBSCRIPTION_SCHEDULER_MODE=supabase`
- restart `agentic-backend.service`

aq2) [have] **Why rollback is safe**
- durable queue truth is still in Supabase
- subscription checkpoints are still in Supabase
- Oracle-local scheduler state can be ignored without losing user-facing truth

aq3) [have] **Do not delete SQLite on first rollback**
- keep the file for inspection/debugging
- only disable Oracle-local scheduling authority

aq4) [have] **Rollback triggers**
- duplicate enqueue behavior
- obvious queue starvation
- restart burstiness
- worse subscription freshness than baseline
- unexpected memory or CPU pressure on Oracle

### Operational Proof Tasks

ar1) [todo] **Required proof after first promotion**
- capture a `24h` request-family comparison
- capture a refreshed upload-to-detection lag sample
- perform one controlled backend restart and confirm scheduler continuity
- verify no duplicate user-visible work appeared

ar2) [todo] **Runbook follow-up once implementation starts**
- update:
  - [yt2bp_runbook.md](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/docs/ops/yt2bp_runbook.md)
- add:
  - Oracle control-plane mode flags
  - SQLite path/backup expectations
  - rollback command sequence

### Step 6 Conclusion

as1) [have] **Main Step 7 conclusion**
- the safest first migration is:
  - bootstrap local SQLite state
  - run Oracle in shadow mode
  - then promote Oracle to primary for subscription scheduling only
- while keeping rollback instant through one env-mode switch
