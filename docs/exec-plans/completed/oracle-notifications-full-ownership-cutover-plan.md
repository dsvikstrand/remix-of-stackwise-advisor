# Oracle Notifications Full Ownership Cutover Plan

Status: `completed`
Owner: `Codex / David`
Last updated: `2026-04-15`

## Purpose

Make Oracle the only normal operational `notifications` system for Bleup in the next ownership chapter.

This is a full migration chapter, but it is still intentionally narrower and safer than `tags` or `channel_candidates`. The explicit end state is:
- Oracle owns normal runtime `notifications`
- Supabase `notifications` stops participating in normal runtime reads/writes
- unread and read-all behavior stay correct
- notification inbox reads stay correct
- push-linked notification flows keep working without broad product regressions

## Explicit End State

a1) [have] Oracle is now the normal operational `notifications` truth for runtime reads and writes.

a2) [have] Normal runtime notification behavior no longer depends on Supabase for:
- notification row writes
- notification inbox reads
- unread/read state transitions
- read-all behavior

a3) [have] Push-linked notification behavior remained correct through the accepted burn-in inspection.

a4) [have] Supabase `notifications` remains compatibility residue for push enqueue only in this chapter phase.

## Why This Plan Exists

b1) [have] Notifications remain one of the safest next migration candidates after `provider_circuit_state`.

b2) [have] This domain is safer than `channel_candidates` and much safer than `tags` because:
- it already has a backend API boundary
- it is more bounded than feed/topic shaping
- user-facing blast radius is real but contained

b3) [have] This chapter is still meaningful from the latest egress shape:
- `notifications` appeared as a leading family in the sampled 24h window
- `POST /rest/v1/notifications` was a visible exact endpoint

## Current Questions To Answer In Inventory

c1) [have] Notification rows are created and updated in:
- [server/services/notifications.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/notifications.ts)
  - `createNotification(...)`
  - `createNotificationFromEvent(...)`
  - `markNotificationRead(...)`
  - `markAllNotificationsRead(...)`
- emit callers in [server/index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)
  - `emitGenerationStartedNotification(...)`
  - `emitGenerationTerminalNotification(...)`

c2) [have] Notification inbox reads are served from:
- [server/services/notifications.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/notifications.ts)
  - `listNotificationsForUser(...)`
- [server/routes/notifications.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/routes/notifications.ts)
  - `GET /api/notifications`

c3) [have] Unread/read and read-all mutations are handled in:
- [server/services/notifications.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/notifications.ts)
  - `markNotificationRead(...)`
  - `markAllNotificationsRead(...)`
- [server/routes/notifications.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/routes/notifications.ts)
  - `POST /api/notifications/:id/read`
  - `POST /api/notifications/read-all`

c4) [have] Push-subscription and dispatch-queue coupling currently relies on:
- [server/services/notificationPush.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/notificationPush.ts)
  - `notification_push_subscriptions`
  - `notification_push_dispatch_queue`
  - `getNotificationById(...)`
  - `countUnreadNotificationsForUser(...)`
- [20260308124500_notification_push_v1.sql](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/supabase/migrations/20260308124500_notification_push_v1.sql)
  - `public.enqueue_notification_push_dispatch()`
  - trigger on `public.notifications`

c5) [have] The browser-side notification inbox dependency is already clean:
- [src/lib/notificationsApi.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/lib/notificationsApi.ts)
- [src/hooks/useNotifications.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useNotifications.ts)
- no direct browser Supabase `notifications` reads/writes were found

## Scope Lock

d1) [have] This plan remained `notifications` only.

d2) [have] `channel_candidates`, `tags`, and broader push-system redesign were kept out of this chapter except where notification ownership required push compatibility.

d3) [have] Focus stayed on:
- notification writes
- notification reads
- unread/read-all state
- notification-to-push linkage only where it is part of notification runtime ownership

## Main Files / Surfaces

e1) [have] Primary backend seams:
- [server/services/notifications.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/notifications.ts)
- [server/routes/notifications.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/routes/notifications.ts)

e2) [have] Related supporting seams:
- [server/services/notificationPush.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/notificationPush.ts)
- [server/index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)
- [src/lib/notificationsApi.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/lib/notificationsApi.ts)
- [src/hooks/useNotifications.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/hooks/useNotifications.ts)

e3) [have] Primary regression coverage targets:
- [src/test/notificationsService.test.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/test/notificationsService.test.ts)
- [src/test/notificationPush.test.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/test/notificationPush.test.ts)
- [src/test/oracleNotifications.test.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/test/oracleNotifications.test.ts)

## Planned Cutover Shape

f1) [todo] Phase 0: One fast inventory and seam confirmation
f2) [have] Phase 1: Oracle-owned notification writes with Supabase compatibility shadow
f3) [have] Phase 2: Oracle-only notification reads
f4) [have] Phase 3: Short burn-in / canary
f5) [have] Phase 4: Cleanup and closure

## Phase 0: One Fast Inventory

g1) [have] Confirmed every notification touchpoint and classified it as:
- runtime write
- runtime read
- unread/read mutation
- push-linked dependency
- browser/product residue

g2) [have] No heavy bootstrap/catalog phase is needed.
- the main compatibility constraint is push-dispatch enqueue, not historical rehydration
- the chapter remains a writes-then-reads cutover, but writes must preserve enqueue compatibility

g3) [have] Explicit seam map:
- runtime writes:
  - `createNotification(...)`
  - `createNotificationFromEvent(...)`
  - `markNotificationRead(...)`
  - `markAllNotificationsRead(...)`
- runtime reads:
  - `listNotificationsForUser(...)`
  - `GET /api/notifications`
- push-linked coupling:
  - Supabase trigger on `public.notifications` enqueues `notification_push_dispatch_queue`
  - push subscription/dispatch helpers still read Supabase notification rows
- browser/product residue:
  - none found for the inbox surface
- tests to update first:
  - `notificationsService.test.ts`
  - `notificationPush.test.ts`
  - `oracleNotifications.test.ts`

g4) [have] Inventory conclusion:
- a naive Oracle-only write pass would break push dispatch enqueue
- the correct first implementation wave is **Notifications Pass 1: Oracle-owned notification writes with explicit Supabase compatibility shadow**

## Phase 1: Oracle-Owned Notification Writes With Compatibility Shadow

h1) [have] Oracle-backed notification writes now land in:
- [server/services/oracleControlPlaneDb.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/oracleControlPlaneDb.ts)
- [server/services/oracleNotifications.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/oracleNotifications.ts)

h2) [have] Notification service write ownership now routes through:
- [server/services/notifications.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/notifications.ts)
  - Oracle-first write path
  - Supabase compatibility shadow write/update path

h3) [have] Compatibility behavior preserved in this pass:
- current inbox reads still use Supabase-backed routes
- current Supabase insert path still fires the existing push enqueue trigger
- mark-read and read-all continue updating the current read path while Oracle stays authoritative for writes

h4) [have] ID alignment is now explicit in app code.
- notification IDs are generated before the dual write
- Oracle and Supabase compatibility rows stay keyed to the same notification ID during the transition

h5) [have] Read-side ownership is complete for:
- inbox list reads
- unread count reads
- push helper reads (`getNotificationById`, `countUnreadNotificationsForUser`)

## Phase 2: Oracle-Only Notification Reads

i1) [have] Notification inbox reads now resolve from Oracle-backed `notification_state`.

i2) [have] Unread-count and mark-read/read-all follow-up reads now resolve from Oracle-backed state.

i3) [have] Push-linked notification helper reads now resolve from Oracle-backed notification rows while push subscriptions and dispatch queue remain on Supabase for this chapter phase.

i4) [have] Landed in this wave:
- [server/services/oracleNotifications.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/oracleNotifications.ts)
  - Oracle list/unread-count helpers for notification inbox reads
- [server/services/notifications.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/notifications.ts)
  - Oracle-backed inbox list path behind the existing service boundary
- [server/services/notificationPush.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/notificationPush.ts)
  - Oracle-backed `getNotificationById(...)`
  - Oracle-backed `countUnreadNotificationsForUser(...)`
- [server/index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)
  - runtime adapter wiring for notification read ownership

i5) [have] Explicitly left out of this pass:
- `notification_push_subscriptions`
- `notification_push_dispatch_queue`
- trigger-driven Supabase push enqueue replacement

i6) [have] Burn-in and closure are now complete.

## Phase 3: Short Burn-In / Canary

j1) [have] Post-cutover inspection was accepted on `2026-04-15`.

j2) [have] Burn-in evidence stayed clean:
- live backend SHA remained `a6900835c64051c5428f16c36a1cb91247606780`
- local and public health stayed green
- Oracle primary parity stayed `PASS`
- `matched_count=90`
- `mismatched_count=0`
- `due_batch_fallback_count=0`

j3) [have] Focused backend log inspection over the notification cutover window did not surface:
- notification correctness regressions
- push-dispatch failure signals
- generic `ERROR|Error|Unhandled|panic|fatal` hits tied to the chapter

## Phase 4: Cleanup And Closure

k1) [have] The chapter end state is accepted:
- Oracle owns normal runtime notification reads and writes
- inbox reads and unread/read-all behavior stayed correct through inspection
- push-linked notification behavior stayed correct through burn-in

k2) [have] The remaining Supabase role is explicitly narrowed:
- compatibility residue for trigger-driven push enqueue only
- not part of ordinary runtime notification reads/writes

k3) [have] This chapter is ready to move to `completed/` and remain as reference for later push-system work.

## Proof Gates

l1) [have] Required proof before declaring the cutover complete:
- Oracle primary/runtime health green
- inbox reads still correct
- unread/read-all behavior still correct
- push-linked notification behavior still correct

l2) [have] Required proof before closure:
- burn-in window accepted
- no unresolved notification correctness regressions
- Supabase `notifications` traffic materially reduced

## Rollback Rules

m1) [have] Fix-forward remained preferred over keeping long-lived dual notification runtime.

m2) [have] No rollback was needed. Any future emergency rollback still must remain explicit and temporary, not a hidden permanent compatibility path.

## Success Criteria

n1) [have] Oracle now owns normal `notifications` operations in runtime.

n2) [have] Supabase `notifications` now carries only the temporary compatibility shadow work for push enqueue.

n3) [have] Notification inbox, unread state, and push-linked behavior remained correct through burn-in.
