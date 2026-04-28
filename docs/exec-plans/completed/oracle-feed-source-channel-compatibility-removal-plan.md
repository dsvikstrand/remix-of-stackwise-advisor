# Oracle Feed/Source/Channel Compatibility Removal Plan

Status: `active`
Owner: `Codex / David`
Last updated: `2026-04-18`

**Status**
a1) [have] The current production breakage/egress spine is the legacy Supabase chain:
- `channel_candidates`
- `user_feed_items`
- `source_items`

a2) [have] The first real migration phase should therefore be:
- full Oracle ownership of `channel_candidates` runtime persistence and reads

a3) [have] The purpose of this phase is not just to reduce egress.
It is to remove the exact dependency that forced `user_feed_items` shadow writes back into the runtime path.

a4) [todo] This phase should end with Supabase `channel_candidates` no longer required for normal runtime channel behavior.

**Phase 1 Goal**
b1) [todo] Make Oracle the only normal runtime owner of channel-candidate state.

b2) [todo] After this phase:
- auto-channel pipeline writes Oracle channel-candidate state only
- published/rejected/pending candidate reads come from Oracle
- stored published-channel lookup comes from Oracle
- Supabase `channel_candidates` is no longer needed for runtime correctness

b3) [todo] Supabase `channel_candidates` may remain as temporary historical residue if needed, but it must stop being part of the normal execution path.

**Implementation plan**
c1) [todo] Add Oracle-owned channel-candidate storage to the control-plane DB.
Files:
- [server/services/oracleControlPlaneDb.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/services/oracleControlPlaneDb.ts)
- new helper: [server/services/oracleChannelCandidateState.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/services/oracleChannelCandidateState.ts)

Schema/behavior:
- candidate row keyed by Oracle feed item id
- fields for:
  - `id`
  - `user_feed_item_id`
  - `channel_slug`
  - `submitted_by_user_id`
  - `status`
  - `created_at`
  - `updated_at`
- unique identity equivalent to current runtime rule:
  - `(user_feed_item_id, channel_slug)`

c2) [todo] Move the full auto-channel pipeline off Supabase `channel_candidates`.
Files:
- [server/services/autoChannelPipeline.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/services/autoChannelPipeline.ts)
- [server/index.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/index.ts)

Required cutover:
- existing candidate lookup -> Oracle
- candidate upsert -> Oracle
- candidate publish -> Oracle
- candidate reject -> Oracle
- idempotent already-published check -> Oracle

Non-goal:
- do not leave “Oracle write plus Supabase candidate shadow write” as the resting state

c3) [todo] Move backend published-channel resolution to Oracle.
Primary file:
- [server/index.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/index.ts)

Required cutover:
- replace `fetchPublishedChannelSlugMapForBlueprints(...)` Supabase `channel_candidates` read path
- resolve published channel from Oracle candidate state via Oracle feed item ids

Reason:
- browse/detail/source surfaces already depend on this truth
- if this stays on Supabase, the migration is incomplete even if writes move

c4) [todo] Move remaining core backend read surfaces that still directly read `channel_candidates`.
Files:
- [server/services/wallFeed.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/services/wallFeed.ts)
- [server/handlers/sourcePagesHandlers.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/handlers/sourcePagesHandlers.ts)
- [server/services/profileHistory.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/services/profileHistory.ts)
- [server/routes/channels.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/routes/channels.ts)

Required rule:
- if a backend runtime surface needs candidate/published-channel state, it must read Oracle, not Supabase

c5) [todo] Decide the treatment of manual channel routes as part of the same phase, not as a forgotten tail.
File:
- [server/routes/channels.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/routes/channels.ts)

Preferred outcome:
- manual candidate submit/evaluate/publish/reject routes also use Oracle channel-candidate state
- no split between “auto pipeline on Oracle” and “manual routes on Supabase”

c6) [todo] Keep feed patching on the current Oracle-aware path.
Relevant seam:
- `patchFeedItemById(...)`

Reason:
- this phase is about channel-candidate ownership
- feed item state updates can stay on the already-shared Oracle-aware feed seam for now

**Testing**
d1) [todo] Add focused Oracle channel-candidate tests.
Likely new file:
- `src/test/oracleChannelCandidateState.test.ts`

Coverage:
- upsert candidate
- unique `(user_feed_item_id, channel_slug)` behavior
- publish transition
- reject transition
- latest published-channel lookup by blueprint/feed

d2) [todo] Re-run the runtime tests that cover the real surfaces touched by this migration.
Primary tests:
- [src/test/feedRoute.test.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/src/test/feedRoute.test.ts)
- [src/test/channelsRoute.test.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/src/test/channelsRoute.test.ts)
- [src/test/sourcePagesHandlers.test.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/src/test/sourcePagesHandlers.test.ts)
- [src/test/wallFeedService.test.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/src/test/wallFeedService.test.ts)
- [src/test/profileHistoryService.test.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/src/test/profileHistoryService.test.ts)

d3) [todo] Verify production behavior after deploy.
Checks:
- fresh source unlock gets a stored channel
- fresh subscription ingestion gets a stored channel
- wall/detail/source page show the stored channel correctly
- no new `channel_candidates_user_feed_item_id_fkey` failures
- Supabase attribution should materially reduce `channel_candidates` traffic

**Closure condition**
e1) [todo] Phase 1 is only done when:
- no normal runtime write depends on Supabase `channel_candidates`
- no normal runtime read depends on Supabase `channel_candidates`
- published channel truth is Oracle-owned end to end
- new generations/subscription items persist channels without relying on Supabase `user_feed_items` for candidate FK compatibility

# Old plan, follow the above instructions if there exist a conflict

## Purpose

Restore true Oracle ownership for the feed/source/channel runtime spine by removing the Supabase compatibility-shadow chain that was reintroduced to stop production failures.

This is not a generic egress trim, and it is not a broad “keep migrating things eventually” note. It is a direct ownership-repair chapter with an explicit end state:
- Oracle owns the normal runtime feed/source/channel linkage
- Supabase `source_items`, `user_feed_items`, and `channel_candidates` stop acting as required compatibility anchors for those flows
- Oracle-primary writes no longer need Supabase shadow rows just to satisfy old foreign keys
- any remaining Supabase usage on this spine becomes historical/manual residue, not a runtime dependency

This chapter exists because the earlier feed and source-item ownership cutovers were functionally correct in isolation, but later production fixes exposed that the old Supabase dependency chain was still alive behind them:
- `channel_candidates.user_feed_item_id` still depended on Supabase `user_feed_items`
- `user_feed_items.source_item_id` still depended on Supabase `source_items`
- removing Supabase participation at the write edge caused real runtime failures
- restoring Supabase shadows fixed correctness, but it also reintroduced large Supabase egress and dual-write complexity

## Explicit End State

a1) [todo] Oracle is the sole normal operational owner for the feed/source/channel runtime chain.

a2) [todo] Normal runtime feed/channel behavior no longer depends on Supabase `user_feed_items` for:
- feed-item existence
- feed-item mutation compatibility
- channel-candidate linkage
- source-unlock attach correctness
- subscription-sync correctness

a3) [todo] Normal runtime source-item behavior no longer depends on Supabase `source_items` for:
- feed-item FK satisfaction
- source-item lookup compatibility
- subscription-sync continuation
- source-unlock continuation

a4) [todo] Normal runtime channel persistence no longer depends on Supabase `channel_candidates` being anchored to Supabase `user_feed_items`.

a5) [todo] Oracle-primary writes no longer perform Supabase shadow writes for `source_items` or `user_feed_items`.

a6) [todo] Supabase egress materially drops because the current compatibility-shadow reads/writes/retries on `source_items`, `user_feed_items`, and `channel_candidates` are gone from steady-state runtime.

## Why This Plan Exists

b1) [have] Current 24h Supabase attribution is dominated by the compatibility-shadow chain rather than the earlier browse/catalog tables.

b2) [have] The fresh sampled attribution window on `2026-04-18` is led by:
- `source_items` `38.5%`
- `feed` `15.4%`
- `channel_candidates` `9.9%`

b3) [have] The top exact normalized endpoints are currently backend-heavy compatibility reads/writes:
- `GET /rest/v1/source_items?id:eq`
- `GET /rest/v1/source_items?canonical_key:eq`
- `GET /rest/v1/user_feed_items?id:eq&user_id:eq`
- `PATCH /rest/v1/source_items?id:eq`

b4) [have] Recent production fixes made this explicit:
- `2008a562` restored Supabase `user_feed_items` shadow writes to stop `channel_candidates_user_feed_item_id_fkey` failures
- `5231d54d` restored Supabase `source_items` shadow writes to stop `user_feed_items_source_item_id_fkey` failures

b5) [have] Those fixes were operationally correct, but they also proved that the old Supabase dependency chain is still part of the real runtime contract.

b6) [have] That means current high Supabase egress is not mainly a “tags/comments still exist” problem.
It is a structural ownership problem in the feed/source/channel spine.

## Current State

c1) [have] Oracle remains the primary runtime truth for feed and source-item state.

c2) [have] Supabase is currently acting as a compatibility-shadow store for this spine, not the intended primary owner.

c3) [have] The current runtime shape is:
- Oracle write/update occurs first
- matching Supabase shadow rows are written to preserve legacy FK compatibility
- some remaining Supabase reads still occur on top of that compatibility layer

c4) [have] This shape restores correctness, but it has three real costs:
- higher Supabase egress
- dual-write/dual-state complexity
- retry/error churn when the compatibility chain is incomplete or stale

c5) [have] Journal evidence from `2026-04-17` into `2026-04-18` shows that retry/error amplification on this seam has been real, especially around subscription sync failures tied to missing Supabase `source_items` rows.

c6) [have] The chapter question is no longer “should Oracle own feed and source items?”
It is “how do we remove the remaining Supabase compatibility anchors without reintroducing production breakage?”

## Scope Lock

d1) [todo] This chapter is limited to the feed/source/channel compatibility spine:
- `source_items`
- `user_feed_items`
- `channel_candidates`

d2) [todo] Do not mix broader catalog migrations (`tags`, `blueprints`, `blueprint_comments`) into this chapter.

d3) [todo] Do not treat this as only a docs/observability task or only an egress trim.

d4) [todo] The primary goal is runtime ownership repair:
- remove the need for Supabase shadow rows on this chain
- preserve working source-unlock, subscription-sync, feed, and channel behavior

## Main Files / Surfaces

e1) [have] Core runtime seams likely include:
- [server/index.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/index.ts)
- [server/services/autoChannelPipeline.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/services/autoChannelPipeline.ts)
- [server/routes/channels.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/routes/channels.ts)
- [server/services/oracleFeedLedgerState.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/services/oracleFeedLedgerState.ts)
- [server/services/oracleSourceItemLedgerState.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/services/oracleSourceItemLedgerState.ts)
- [server/services/oracleProductState.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/services/oracleProductState.ts)
- [server/handlers/sourcePagesHandlers.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/handlers/sourcePagesHandlers.ts)
- [server/services/sourceSubscriptionSyncService.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/services/sourceSubscriptionSyncService.ts)
- [server/routes/feed.ts](/mnt/c/users/dell/documents/vsc/app/bleu/bleu/server/routes/feed.ts)

e2) [have] The hot legacy dependency chain to sever is:
- Oracle source item -> Supabase `source_items` shadow
- Oracle feed item -> Supabase `user_feed_items` shadow
- channel persistence/read paths -> Supabase `channel_candidates`

## Strategy

f1) [have] The safe lesson from the last two hotfixes is:
- do not remove compatibility shadows before the legacy consumers are replaced
- but do not leave those shadows as the resting architecture either

f2) [todo] The strategy is:
1. inventory every remaining live dependency on the Supabase chain
2. replace those dependencies with Oracle-owned linkage/readers
3. prove runtime correctness
4. remove the Supabase shadow writes

f3) [todo] This chapter should prefer editing existing runtime seams over creating broad new surfaces unless the old FK/storage model cannot be safely reused.

## Phase 0: Dependency Inventory Lock

g1) [todo] Enumerate every remaining runtime read/write/constraint that still requires:
- Supabase `source_items`
- Supabase `user_feed_items`
- Supabase `channel_candidates`

g2) [todo] Classify each touchpoint as:
- runtime write dependency
- runtime read dependency
- FK/constraint dependency
- product/UI read dependency
- retry/error amplifier
- removable residue

g3) [todo] Output:
- one explicit replace/remove decision per live Supabase dependency on this spine

## Phase 1: Remove Channel Persistence Dependence On Supabase Feed Rows

h1) [todo] Replace the current `channel_candidates -> user_feed_items` dependency so auto-channel persistence no longer requires a Supabase feed row.

h2) [todo] Likely direction:
- move channel candidate persistence/linkage onto Oracle-owned feed identity
- or make the existing channel state path resolve through Oracle-owned feed rows without the old Supabase FK chain

h3) [todo] Required behavior to preserve:
- valid classifier results persist durably
- source unlocks still get a stored/published channel
- subscription-created feed items still get channel persistence

## Phase 2: Remove Feed Dependence On Supabase Source Rows

i1) [todo] Replace the current `user_feed_items -> source_items` legacy dependency so normal feed persistence no longer requires a Supabase source row.

i2) [todo] Oracle feed rows should link against Oracle source-item truth directly for runtime behavior.

i3) [todo] Required behavior to preserve:
- source unlock success
- subscription sync success
- feed item promotion/update correctness
- source-page/feed linkage correctness

## Phase 3: Cut Runtime Reads Off The Supabase Compatibility Chain

j1) [todo] Remove the remaining backend runtime reads that still hit Supabase `source_items`, `user_feed_items`, or `channel_candidates` on this spine.

j2) [todo] The target is:
- source sync paths read Oracle-owned source state
- feed paths read Oracle-owned feed state
- channel persistence/read paths read Oracle-owned channel linkage

j3) [todo] After this phase, Supabase should no longer be participating in normal runtime decision-making for this chain.

## Phase 4: Remove Supabase Shadow Writes

k1) [todo] Remove the compatibility writes whose only job is keeping the legacy Supabase chain alive:
- Supabase `source_items` shadows
- Supabase `user_feed_items` shadows

k2) [todo] Keep rollback/fix-forward explicit.
Do not leave hidden long-lived dual-write toggles behind as the resting state.

k3) [todo] After this phase, any remaining Supabase rows on this spine should be historical/manual residue only.

## Phase 5: Burn-In / Proof

l1) [todo] Burn-in must prove:
- source unlocks succeed
- subscription sync succeeds
- auto-channel persistence succeeds
- no new FK-driven runtime failures on this chain
- no user-visible wall/detail/source-page regressions

l2) [todo] Closure evidence must include:
- public/local health green
- Oracle primary parity green
- journal free of the recent compatibility-chain FK failures
- sampled Supabase attribution showing feed/source/channel compatibility traffic materially reduced

## Proof Gates

m1) [todo] Required proof before declaring this chapter complete:
- Oracle remains runtime truth for feed/source/channel behavior
- no Supabase shadow write is required for normal source-unlock flow
- no Supabase shadow write is required for normal subscription-sync flow
- no `channel_candidates_user_feed_item_id_fkey` class of failure remains
- no `user_feed_items_source_item_id_fkey` class of failure remains

m2) [todo] Success means both:
- correctness preserved
- Supabase egress materially reduced on this spine

## Rollback Rules

n1) [todo] Prefer fix-forward over reintroducing long-lived Supabase shadow dependencies.

n2) [todo] Any emergency rollback should be an explicit temporary compatibility restoration with a clearly bounded follow-up, not a silent permanent return to dual-write runtime.
