# Oracle Transcript-Bound Queue Slot Alignment Plan

Status: `active`
Owner: `Codex / David`
Last updated: `2026-04-24`

## Purpose

Align queued generation/unlock execution with the real bottleneck: transcript throughput.

Today, transcript-bound work is admitted by the main ingestion/generation queue and then later encounters a second internal transcript-throttle queue. That split is what allows an already admitted job to fail with:
- `RATE_LIMITED`
- `Transcript queue is currently busy. Please retry shortly.`

This chapter exists to remove that mismatch.

The goal is not a quick patch. The goal is to move transcript-bound queued work toward a simpler and more robust control model:
- one main waiting queue
- one bounded active slot pool
- transcript throttle retained as provider safety/backoff, not as the normal user-visible rejection path for admitted jobs

## Explicit End State

a1) [todo] Transcript-bound queued jobs wait in one main FIFO queue before they start.

a2) [todo] Active transcript-bound work is bounded by:
- `min(WORKER_CONCURRENCY, TRANSCRIPT_THROTTLE_MAX_CONCURRENCY)`

a3) [todo] A queued transcript-bound job that has been admitted no longer fails just because the internal transcript throttle queue is busy.

a4) [todo] Queued generation/unlock transcript fetches use background semantics, not the current interactive fast-fail path.

a5) [todo] Transcript throttle still protects providers with cooldown/backoff, but it is no longer the normal user-visible queue for admitted jobs.

a6) [todo] Per-user limits, retry discipline, and queue observability remain intact after the alignment.

## Why This Plan Exists

b1) [have] The current runtime already has the core ingredients of the problem:
- main worker/job queue admission
- a separate transcript throttle with its own concurrency and cooldown
- interactive transcript requests that fail fast after a short wait

b2) [have] Live configuration currently makes the mismatch visible:
- `WORKER_CONCURRENCY=4`
- `TRANSCRIPT_THROTTLE_MAX_CONCURRENCY=4`
- `TRANSCRIPT_THROTTLE_INTERACTIVE_MAX_WAIT_MS=2000`

b3) [have] That means admitted queued work can still reach the transcript stage, sit behind the transcript throttle, and fail with a local Bleup `RATE_LIMITED` classification even though the system already has a main queue.

b4) [have] If transcript throughput is the true bottleneck, the stronger model is to align queue start/claim behavior to transcript-safe runnable capacity instead of allowing a second user-visible queueing failure deeper in the pipeline.

## Scope Lock

c1) [todo] This chapter covers transcript-bound queued generation/unlock work and its queue-control semantics.

c2) [todo] It may touch:
- queue admission / queue claim logic
- queued ingestion worker control
- transcript throttle semantics for queued jobs
- queued unlock/generation request-class wiring
- observability for active slots and waiting work

c3) [todo] It must not silently broaden into a full queue-system rewrite for unrelated non-transcript job classes unless a concrete dependency forces that work.

## Main Runtime Seams

d1) [todo] Queue/worker control:
- [server/index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)
- [server/services/queuedIngestionWorkerController.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/queuedIngestionWorkerController.ts)

d2) [todo] Transcript throttle and request-class policy:
- [server/services/transcriptThrottle.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/transcriptThrottle.ts)
- [server/transcript/transcriptService.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/transcript/transcriptService.ts)
- [server/services/transcriptFetchWithCacheBypass.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/transcriptFetchWithCacheBypass.ts)

d3) [todo] Queued generation/unlock call sites that currently pass interactive semantics:
- [server/index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)
- [server/handlers/youtubeHandlers.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/handlers/youtubeHandlers.ts)

d4) [todo] Queue admission and user-facing queue state:
- [server/routes/ingestion.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/routes/ingestion.ts)
- Oracle queue admission / claim tests

## Current State

e1) [have] Worker concurrency and transcript concurrency are separately configured and only loosely aligned.

e2) [have] Transcript throttle has explicit fast-fail behavior for interactive requests after a short queue wait.

e3) [have] Some queued generation/unlock paths still pass `requestClass: 'interactive'`, which is the wrong policy if the work is already admitted into a backend queue.

e4) [have] This produces the user-visible bad shape:
- job is queued and admitted
- job starts
- transcript stage is saturated
- job fails with local `Transcript queue is currently busy`

e5) [have] The desired shape is simpler:
- waiting happens in one place
- active work occupies a bounded slot pool
- a finished or failed slot opens exactly one new runnable slot

## Strategy

f1) [have] The immediate fix is policy alignment:
- queued generation/unlock transcript work should be background, not interactive

f2) [have] The structural fix is queue-slot alignment:
- transcript-bound job start/claim must respect the real transcript bottleneck

f3) [have] The correct end state is not “remove all provider safety.”
It is:
- main queue owns waiting
- slot pool owns active parallelism
- transcript throttle remains a safety/backoff mechanism inside active work

f4) [have] Expected effort:
- likely `2` implementation waves
- conservatively `3` max before soak

## Phase 0: Inventory And Classification

g1) [todo] Enumerate every queued generation/unlock path that eventually calls transcript fetch.

g2) [todo] Classify each queued path as:
- transcript-bound queued work
- non-transcript queued work
- direct foreground interaction

g3) [todo] Confirm which currently use:
- `requestClass: 'interactive'`
- `requestClass: 'background'`

g4) [todo] Confirm which queue claim/start decisions are currently governed by worker slots only versus transcript-safe runnable capacity.

## Phase 1: Policy Alignment For Admitted Jobs

h1) [todo] Change queued generation/unlock transcript fetches to use background semantics.

h2) [todo] Remove normal user-visible transcript-busy fast-fail behavior from admitted queued jobs.

h3) [todo] Keep true foreground/direct request/response paths on interactive semantics where short fail-fast behavior still makes product sense.

h4) [todo] Add focused tests showing:
- admitted queued work waits instead of failing with transcript-busy
- direct interactive paths still preserve current bounded behavior where intended

## Phase 2: Slot-Pool Alignment

i1) [todo] Define one effective active-slot limit for transcript-bound queued jobs:
- `min(WORKER_CONCURRENCY, TRANSCRIPT_THROTTLE_MAX_CONCURRENCY)`

i2) [todo] Align queue claim/start behavior so transcript-bound jobs only leave the main queue when a slot is available.

i3) [todo] Ensure the active pool is treated as running work, not as a second queue:
- queue -> active slots -> completed/failed/retry scheduled

i4) [todo] Ensure a completed or terminally failed active slot frees exactly one runnable slot for the next queued job.

## Phase 3: Retry, Fairness, And Observability

j1) [todo] Preserve per-user queue limits and fairness:
- `QUEUE_DEPTH_*`
- `QUEUE_WORK_ITEMS_*`

j2) [todo] Ensure retries do delayed requeue/backoff instead of immediate churn back into the active slot pool.

j3) [todo] Strengthen observability for:
- queued count
- active slot count
- active slot occupancy by job/scope
- retry-scheduled count
- blocked-by-capacity decisions

j4) [todo] Make it operationally obvious why a job is:
- queued
- running
- retrying
- failed
- completed

## Proof Gates

k1) [todo] Technical proof:
- run `npm run typecheck`
- run focused Vitest for queue admission/claim, transcript throttle, and unlock/generation route behavior
- run `npm run build`

k2) [todo] Runtime proof:
- queued unlock/generation jobs no longer fail with transcript-busy just because the transcript stage is saturated
- foreground/direct interactions still behave coherently
- queue occupancy and active slot behavior are observable and consistent

k3) [todo] Ops proof:
- backend health green
- Oracle primary parity green
- no new queue/worker crash or starvation signatures

k4) [todo] Product proof:
- admitted jobs wait visibly instead of failing for local transcript-busy saturation
- active work count matches configured slot capacity under burst load

## Closure Condition

l1) [todo] This chapter is done only when:
- transcript-bound queued work waits in one main queue
- active transcript-bound work is bounded by the slot-pool rule
- admitted jobs no longer fail due to the internal transcript-busy fast-fail path
- transcript throttle remains a provider-protection mechanism rather than a normal user-visible rejection path for admitted jobs
- live health/parity are clean after soak

## Notes

m1) [have] This plan is intentionally narrower than a total queue rewrite.
It exists to fix the transcript-bound control mismatch first.

m2) [have] If later evidence shows mixed job classes require different runnable pools or priority handling, that should be a follow-up chapter, not silently absorbed into this one.
