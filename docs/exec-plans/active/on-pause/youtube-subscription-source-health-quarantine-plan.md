# YouTube Subscription Source Health + Quarantine Plan

## Status
a1) [have] Queue ownership, scheduler enqueue, and worker-claim behavior are now stable after `fbfe00b4` and `c28b85e3`.
a2) [have] Oracle scheduler state already distinguishes `feed_transient_error` from `feed_not_found` and applies stronger backoff to persistent not-found feeds.
a3) [todo] Repeated YouTube feed `404/500` failures still create source-health noise and consume polling budget.
a4) [todo] Operators need clearer source-health attribution before any destructive action such as deactivating a subscription.

## Objective
b1) [todo] Reduce repeated bad-source polling and log noise without hiding real new uploads from healthy subscribed channels.
b2) [todo] Keep the first round non-destructive: classify, annotate, and back off; do not remove or deactivate user subscriptions automatically.
b3) [todo] Promote only repeated confirmed `404` behavior into persistent not-found handling; keep `500` and network failures transient.

## Round 1: Classification + Backoff Groundwork
c1) [todo] Treat a same-channel confirmed `404` as transient only once, then route repeated confirmed `404`s into `feed_not_found`.
c2) [todo] Annotate `subscription_schedule_state.scheduler_notes_json` with source-health state, error class, consecutive error count, next due timestamp, and quarantine-candidate flag.
c3) [todo] Increase persistent `feed_not_found` backoff so five consecutive not-found failures reach the 24-hour revisit cap.
c4) [todo] Add targeted regression tests for repeated confirmed `404` classification and quarantine-candidate scheduler notes.

## Round 2: Ops Visibility
d1) [todo] Add or document an ops query/API that reports counts by source-health state, top failing channels, and quarantine candidates.
d2) [todo] Add a daily/soak inspection checklist that separates provider flakiness, bad stored channel IDs, and truly unavailable sources.

## Round 3: Recovery + Quarantine Policy
e1) [todo] Add an explicit recovery worker for quarantine candidates: resolve channel URL, resolve creator name, retry canonical feed, and clear degraded state on success.
e2) [todo] Consider UI/admin surfacing for persistently unavailable subscriptions only after the non-destructive path has soaked.
e3) [todo] Consider automatic deactivation only with explicit product approval and proof that source recovery cannot find a valid channel.

## Validation
f1) [todo] Targeted tests: `sourceSubscriptionSyncService`, `oracleSubscriptionSchedulerState`.
f2) [todo] Runtime checks: post-deploy scheduler cycles keep succeeding, and repeated `404` rows accumulate longer `next_due_at` values instead of cycling every few minutes.
f3) [todo] Health checks: frontend/API 200, backend/worker active, no queued/running job buildup.
