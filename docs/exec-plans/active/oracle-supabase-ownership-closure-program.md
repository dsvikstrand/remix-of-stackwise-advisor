# Oracle/Supabase Ownership Closure Program

Status: `active`
Owner: `Codex / David`
Last updated: `2026-05-06`

## Purpose

Move Bleu from a mid-migration backend shape into the cleanest practical ownership model:

- Oracle owns normal runtime product state for migrated domains
- Supabase remains only where it is intentionally still the owner, mainly auth/session and explicitly retained managed-service surfaces
- compatibility shadows, legacy FK accommodations, direct browser product-table reads, and hidden runtime fallbacks are removed or made explicitly break-glass/bootstrap only
- every remaining Oracle/Supabase seam has an owner, a reason, and a closure decision

This is a multi-session program, not a single implementation job. The goal is robust closure and operational simplicity, not another small egress patch.

## Current State

a1) [have] The app is currently best described as Oracle-primary with Supabase compatibility residue.

a2) [have] Completed Oracle ownership chapters already cover the major hot domains:
- queue
- unlocks
- feed
- source items
- generation state
- generation trace
- provider circuit state
- notifications
- blueprint comments
- blueprints and profiles

a3) [have] Current runtime health is generally good and Supabase egress is low enough for normal operation.

a4) [todo] The backend is not clean yet because compatibility residue still exists:
- Supabase compatibility shadows for Oracle-owned domains
- legacy FK paths that can force Oracle-primary jobs to create Supabase shadow rows
- explicit fallback reads in some primary-mode paths
- paused ownership plans for likes, tags, blueprint tags, YouTube comments, and source-health cleanup
- old stale bridge rows that need deterministic recovery or cleanup

a5) [todo] The frontend is not fully isolated from product-table Supabase access yet; the target is backend Oracle-aware APIs for product runtime state and Supabase mainly for auth/session.

a6) [have] Live Oracle config on `2026-05-06` confirms the major runtime ledgers are already in `primary`:
- `ORACLE_QUEUE_LEDGER_MODE=primary`
- `ORACLE_SUBSCRIPTION_LEDGER_MODE=primary`
- `ORACLE_UNLOCK_LEDGER_MODE=primary`
- `ORACLE_FEED_LEDGER_MODE=primary`
- `ORACLE_SOURCE_ITEM_LEDGER_MODE=primary`
- `ORACLE_GENERATION_STATE_MODE=primary`
- `ORACLE_SUBSCRIPTION_SCHEDULER_MODE=primary`

a7) [have] Oracle control-plane tables already exist for several remaining paused social/tag domains:
- `blueprint_like_state`
- `blueprint_tag_state`
- `tag_state`
- `tag_follow_state`
- `blueprint_youtube_comment_state`
- `blueprint_comment_state`
- `blueprint_state`
- `profile_state`

## Explicit End State

b1) [todo] Every product/runtime domain is classified in one ownership ledger as one of:
- Oracle-owned runtime truth
- Supabase-owned runtime truth
- compatibility shadow
- bootstrap-only
- break-glass only
- delete candidate

b2) [todo] Oracle-owned domains have no normal runtime Supabase reads or writes.

b3) [todo] Any remaining Supabase usage for Oracle-owned domains is explicit, observable, and limited to bootstrap, historical migration, or break-glass operations.

b4) [todo] Browser code no longer directly queries or mutates Supabase product tables for Oracle-owned domains.

b5) [todo] Legacy FK dependencies no longer force Oracle-primary runtime paths to create Supabase shadow rows.

b6) [todo] CI or scripted guardrails prevent accidental reintroduction of direct Supabase product-table access for Oracle-owned domains.

b7) [todo] The registry and canonical docs describe the final backend ownership boundary clearly enough that a new engineer can tell what owns what without reading historical plans.

## Non-Goals

c1) [have] This program does not require deleting Supabase entirely.

c2) [have] This program does not remove Supabase auth/session unless a separate auth architecture decision is made.

c3) [have] This program does not remove historical Supabase tables before runtime ownership is proven and rollback posture is clear.

c4) [have] This program does not treat completed exec plans as runtime truth. Runtime truth must be verified against current code and live behavior.

## Operating Principles

d1) [have] Prefer one runtime owner per domain.

d2) [have] Hidden fallback is technical debt unless it is explicitly break-glass and observable.

d3) [have] Compatibility shadows should contract over time; they should not become a permanent second backend.

d4) [have] Each session should produce either implementation progress or a concrete closure decision, not vague discovery.

d5) [have] Do not sever a Supabase path until the Oracle path has proof for correctness, health, and product behavior.

## Session 0: Ownership Ledger And Boundary

e1) [have] Create a current ownership ledger covering all important product/runtime domains:
- auth/session
- profiles
- blueprints
- blueprint likes
- blueprint comments
- blueprint YouTube comments
- tags
- blueprint tags
- tag follows
- source pages
- source channels
- source items
- subscriptions
- feed rows
- unlocks
- queue/jobs
- generation variants
- generation runs
- generation events
- provider circuits
- notifications
- credit wallet / credit ledger

e2) [have] For each domain, record:
- intended runtime owner
- current runtime owner
- remaining Supabase table usage
- remaining Oracle table usage
- compatibility-shadow status
- fallback status
- closure decision

e3) [have] Update this plan with the ownership ledger summary.

e4) [todo] Promote the final ledger into canonical architecture/runbook docs after the implementation chapters converge; the current ledger is a working implementation map, not the final runtime contract.

## Session 1: Runtime Residue Audit

f1) [have] Inventory remaining direct Supabase product-table reads/writes in backend code by static scan.

f2) [have] Inventory remaining direct Supabase product-table reads/writes in frontend code by static scan.

f3) [have] Classify the main residue clusters as:
- cut now
- cut during a named ownership chapter
- keep intentionally
- bootstrap/break-glass only
- delete candidate

f4) [have] Produce a prioritized implementation sequence from the real callers, not just historical attribution.

f5) [todo] Before each code chapter, do a local line-level caller review for that chapter's tables. The Session 1 audit is a first-pass ownership map, not a replacement for implementation-specific inspection.

## Session 0 Result: Ownership Ledger

g1) [have] Working ownership ledger as of `2026-05-06`:

| Domain | Intended Owner | Current Owner | Supabase Residue | Oracle State | Closure Decision |
| --- | --- | --- | --- | --- | --- |
| Auth/session | Supabase | Supabase | Expected auth/session client usage | None needed | Keep Supabase-owned |
| Profiles | Oracle runtime + Supabase compatibility | Mostly Oracle-backed, some direct reads remain | `profiles` direct reads in profile/comment/landing/search paths | `profile_state` | Cut product reads where practical; keep auth identity separate |
| Blueprints | Oracle runtime + compatibility residue | Oracle-backed APIs exist, direct reads remain | `blueprints` reads/writes in legacy/create/search/landing paths | `blueprint_state` | Audit per surface; prefer backend API reads |
| Blueprint likes | Oracle runtime | Mixed; Oracle API exists but backend wall and some surfaces still have Supabase residue | `blueprint_likes` reads in wall/profile-like paths and bootstrap | `blueprint_like_state` | Next implementation chapter candidate |
| Blueprint comments | Oracle runtime | Mostly completed | `blueprint_comments` bootstrap/compatibility only found | `blueprint_comment_state` | Keep as completed unless attribution says otherwise |
| Blueprint YouTube comments | Oracle runtime | Mixed/paused | `blueprint_youtube_comments` and refresh-state reads/writes remain in service/hook | `blueprint_youtube_comment_state` | Later implementation chapter if attribution/noise remains |
| Tags | Oracle runtime | Mixed/paused | `tags` direct reads/writes in backend and frontend | `tag_state` | Merge with blueprint-tags/tag-follows chapter |
| Blueprint tags | Oracle runtime | Mixed/paused | `blueprint_tags` direct reads/writes in backend and frontend | `blueprint_tag_state` | High-priority implementation chapter after likes or combined with tags |
| Tag follows | Oracle runtime | Mixed/paused | `tag_follows` direct reads/writes in frontend/backend | `tag_follow_state` | Merge into tags chapter |
| Source pages | Supabase/product retained unless new Oracle chapter opens | Supabase | `source_pages` direct reads/writes remain | No dedicated durable source-page table found | Keep for now; classify as retained product table |
| Source channels/channel candidates | Oracle-assisted | Mixed | `channel_candidates`, `channel_gate_decisions`, `channel_default_banners` remain | `channel_candidate_state`, `channel_gate_decision_state` | Keep unless attribution/problem appears |
| Source items | Oracle runtime | Primary | `source_items` compatibility/bootstrap/fallback residues remain | `source_item_ledger_state`, `product_source_item_state` | Final tail cleanup candidate |
| Subscriptions | Oracle runtime | Primary | `user_source_subscriptions` compatibility and YouTube import residues remain | `subscription_ledger_state`, `product_subscription_state` | Contract shadows; do not attack before higher-value social/tag residue |
| Feed rows | Oracle runtime | Primary | `user_feed_items` compatibility/fallback/history residues remain | `feed_ledger_state`, `product_feed_state` | Contract shadows and browser fallback residue |
| Unlocks | Oracle runtime | Primary | `source_item_unlocks` compatibility/fallback/sweep residues remain | `unlock_ledger_state`, `product_unlock_state` | Cleanup stale processing rows and FK shadows |
| Queue/jobs | Oracle runtime | Primary | `ingestion_jobs` compatibility shadows and ops fallbacks remain | `queue_ledger_state`, `job_activity_state` | Contract legacy FK/shadow seams |
| Generation variants/runs/events | Oracle runtime | Primary | `source_item_blueprint_variants`, `generation_runs`, `generation_run_events` compatibility/bootstrap remains | `generation_variant_state`, `generation_run_state`, `generation_run_event_state` | Keep as completed unless attribution says otherwise |
| Provider circuits | Oracle runtime | Primary | `provider_circuit_state` compatibility reads/writes remain in service fallback | `provider_circuit_state` | Keep completed; no current action |
| Notifications | Oracle runtime with Supabase push-dispatch compatibility | Mixed by design | `notifications`, `notification_push_*` remain for push path | `notification_state` | Keep until push-dispatch enqueue replacement exists |
| Credit wallet / ledger | Supabase retained | Supabase | `user_credit_wallets`, `credit_ledger` direct writes remain | `credit_wallet_state`, `credit_ledger_state` mirrors exist | Retain until a separate wallet ownership decision |
| YouTube OAuth/import | Supabase retained | Supabase | `user_youtube_connections`, `youtube_oauth_states`, `user_youtube_onboarding` | None needed | Keep Supabase-owned for now |
| Legacy routine/social tables | Delete/deprecate candidate | Supabase legacy | `wall_posts`, `wall_comments`, `comment_likes`, `post_likes`, `post_bookmarks`, `inventories`, `recipes` residues | None | Separate legacy product cleanup, not Oracle migration critical path |

## Session 1 Result: Residue Audit

h1) [have] Static direct Supabase table-touch counts, excluding tests, show the largest remaining code clusters:

| Table | Count | Interpretation |
| --- | ---: | --- |
| `ingestion_jobs` | 41 | Mostly queue compatibility, ops, stale recovery, legacy FK shadows |
| `blueprints` | 40 | Mixed blueprint runtime, landing/search legacy reads, creation compatibility |
| `user_source_subscriptions` | 35 | Subscription compatibility/import/scheduler residues |
| `user_feed_items` | 29 | Feed compatibility/history/fallback residues |
| `source_item_unlocks` | 29 | Unlock compatibility/sweep/fallback residues |
| `tags` | 24 | Active tag ownership residue |
| `source_items` | 20 | Source-item compatibility/fallback residues |
| `profiles` | 14 | Profile/comment/search/landing read residue |
| `blueprint_tags` | 14 | Active blueprint-tag ownership residue |
| `generation_runs` | 13 | Generation trace/state compatibility residue |
| `source_pages` | 13 | Retained Supabase-owned source-page product surface |
| `source_item_blueprint_variants` | 9 | Generation-state compatibility residue |
| `blueprint_youtube_refresh_state` | 8 | YouTube-comment refresh compatibility residue |
| `notifications` / `notification_push_*` | 20 total | Push dispatch compatibility, intentionally retained for now |
| `blueprint_youtube_comments` | 5 | YouTube-comment ownership residue |
| `tag_follows` | 4 | Active tag-follow ownership residue |
| `blueprint_likes` | 3 | Small but important live social-runtime residue |

h2) [have] Backend residue clusters:
- `server/index.ts` still contains the largest compatibility surface, including queue, subscription, unlock, feed, source-item, tags, blueprint tags, likes, and legacy FK helpers.
- `server/services/wallFeed.ts` still has direct Supabase residues for `blueprint_likes`, `blueprints`, `profiles`, `source_items`, `source_item_unlocks`, `user_feed_items`, and `channel_candidates`.
- `server/services/blueprintCreation.ts`, `server/services/autoChannelPipeline.ts`, and `server/routes/channels.ts` still write or read tag/blueprint-tag state directly.
- `server/services/blueprintYoutubeComments.ts` still has direct YouTube-comment and refresh-state Supabase paths.
- `server/services/autoUnlockBilling.ts` and related unlock code still depend on Supabase auto-unlock intent/participant tables.

h3) [have] Frontend residue clusters:
- direct product reads remain in search/landing/community stats hooks (`blueprints`, `profiles`, `tags`, `blueprint_tags`).
- direct tag and blueprint-tag reads/writes remain in `useBlueprints`, `useBlueprintSearch`, `useExploreSearch`, `usePopularBlueprintTags`, `useSuggestedTags`, `blueprintTagsApi`, `myFeedData`, and `Channels`.
- direct YouTube-comment reads remain in `useBlueprintYoutubeComments`.
- legacy routine/social surfaces still query old tables (`wall_posts`, `wall_comments`, `post_likes`, `comment_likes`, `post_bookmarks`, `inventories`, recipe-related tables).

h4) [have] The strongest next implementation order from the current caller map is:
- `blueprint_likes`: small call surface, Oracle state/API already exists, user-facing social correctness matters.
- `tags + blueprint_tags + tag_follows`: larger but high-value cleanup; Oracle state already exists, but backend and frontend callers are still broad.
- `blueprint_youtube_comments`: bounded service/hook cleanup after social/tag state.
- legacy FK/shadow contraction: attack after the main product callers are cleaner, except for acute bugs.
- frontend product-data isolation guardrails: add after the first two cutovers to avoid fighting active migration work.

h5) [todo] The next code plan should start with `blueprint_likes` unless live attribution or product symptoms point elsewhere.

## Session 2: Finish Remaining Product Ownership Chapters

g1) [todo] Resume and complete `blueprint_likes` ownership.
Target:
- Oracle owns like reads, writes, counts, user-liked state, and profile liked-list behavior.

g2) [todo] Resume and consolidate `tags`, `blueprint_tags`, and `tag_follows` ownership.
Target:
- Oracle owns tag directory, tag follows, and blueprint-tag joins for normal runtime.

g3) [todo] Resume and complete `blueprint_youtube_comments` ownership if current code/live attribution still shows meaningful runtime residue.

g4) [todo] Close the final `source_items` ownership tail if runtime audit finds remaining source-item fallback or shadow residue.

g5) [todo] Re-check whether paused plans should remain paused, be merged into this program, or move to completed/deserted after current-code inspection.

## Blueprint Likes Round 1 Implementation Plan

p1) [have] Current code is more advanced than the paused `oracle-blueprint-likes-full-ownership-plan.md` assumes:
- Oracle state already exists in `blueprint_like_state`
- backend like routes already exist under `/api/blueprints/:id/like-state`, `/api/blueprints/:id/like`, `/api/blueprint-likes/state`, and `/api/me/blueprint-likes`
- frontend detail/wall/profile like mutations and liked-list reads already use backend APIs
- the remaining normal-runtime `blueprint_likes` table references are concentrated in `server/services/wallFeed.ts`

p2) [have] The remaining direct `blueprint_likes` runtime reads are:
- `server/services/wallFeed.ts` public wall enrichment fallback for viewer liked state
- `server/services/wallFeed.ts` For You enrichment fallback for viewer liked state

p3) [have] The remaining `blueprint_likes` non-runtime reference is:
- `server/services/oracleBlueprintLikeState.ts` bootstrap from Supabase into Oracle state

p4) [have] Round 1 target:
- make wall feed like-state hydration require the injected Oracle-backed `readLikedBlueprintIds` dependency
- remove direct Supabase `blueprint_likes` fallback reads from `server/services/wallFeed.ts`
- keep Supabase `blueprint_likes` only as bootstrap/break-glass residue in Oracle state bootstrap
- update tests so wall feed service tests provide the Oracle-like dependency explicitly instead of relying on mock Supabase `blueprint_likes`

p5) [have] Files changed:
- `server/services/wallFeed.ts`
- `src/test/wallFeedService.test.ts`
- `server/contracts/api/wall.ts`
- `docs/exec-plans/active/oracle-supabase-ownership-closure-program.md`

p6) [have] Implementation steps:
- make `readLikedBlueprintIds` mandatory in wall feed input contracts for authenticated like-state hydration
- replace fallback branches with injected dependency use
- add a safe unauthenticated branch that returns no liked ids without touching Supabase
- update wall feed tests with a local `readLikedBlueprintIdsFromState(...)` helper where liked state is expected
- add or adjust a regression test that fails if wall feed touches `blueprint_likes` without the dependency

p7) [have] Verification:
- `npm run typecheck`
- `npm test -- --run src/test/wallFeedService.test.ts src/test/blueprintLikesRoute.test.ts src/test/oracleBlueprintLikeState.test.ts`
- `npm run build`
- `rg -n "from\\('blueprint_likes'\\)|from\\(\"blueprint_likes\"\\)" server src --glob '*.ts' --glob '*.tsx'`

p8) [have] Expected post-Round 1 grep result:
- only Oracle bootstrap/test fixtures should mention `blueprint_likes`
- no normal wall/profile/detail runtime path should read `blueprint_likes` from Supabase

p9) [have] Deployment proof:
- deployed commit `d86d46f141a8434e66b99ebe8a952ba8e6444dd1` to Oracle on `2026-05-06`
- release artifact verification passed during deploy
- backend health passed after restart
- queue health passed after restart with `queue_depth=0`, `running_depth=0`, and `stale_leases=0`
- release smoke passed locally on Oracle
- deployed source grep still shows only `server/services/oracleBlueprintLikeState.ts` reading Supabase `blueprint_likes`

p10) [todo] Soak proof:
- confirm wall and For You still show correct liked state during normal use
- confirm like/unlike still updates counts and invalidates profile liked-blueprints
- confirm Supabase attribution does not show normal-runtime `blueprint_likes` reads after soak

## Session 3: Legacy FK And Compatibility-Shadow Contraction

h1) [todo] Identify every legacy FK path that still forces Oracle-owned runtime to satisfy Supabase constraints.

h2) [todo] Remove, neutralize, or bypass legacy FK dependencies where safe.

h3) [todo] Contract Supabase shadow writes for Oracle-owned domains to bootstrap/break-glass only.

h4) [todo] Add logs or metrics for any compatibility write that remains after contraction.

h5) [todo] Add targeted tests for each removed FK/shadow seam so the app does not regress into generic pre-dispatch failures.

## Session 4: Frontend Product-Data Isolation

i1) [todo] Replace direct browser Supabase reads for Oracle-owned product domains with backend Oracle-aware APIs.

i2) [todo] Replace direct browser Supabase writes for Oracle-owned product domains with backend Oracle-aware mutations.

i3) [todo] Keep Supabase client usage in the browser focused on auth/session and any intentionally Supabase-owned surfaces.

i4) [todo] Add lint/grep guardrails for direct browser product-table access.

## Session 5: Operational Cleanup And Stale-State Recovery

j1) [todo] Clean or recover stale bridge rows, starting with expired `processing` unlocks that survived the current sweeps.

j2) [todo] Make unlock/feed/generation sweep outcomes observable enough that stale state cannot silently survive.

j3) [todo] Add one safe ops script or endpoint for read-only ownership health and stale-residue reporting.

j4) [todo] Verify cleanup behavior on Oracle without introducing new Supabase egress or hidden fallback.

## Session 6: CI And Governance Guardrails

k1) [todo] Add a repo-level ownership allowlist for Supabase tables.

k2) [todo] Add automated checks that fail when code introduces direct Supabase access to Oracle-owned domains outside approved files.

k3) [todo] Add docs freshness/link checks to the closure workflow.

k4) [todo] Update the runbook with the final “what owns what” model and rollback rules.

## Session 7: Soak And Closure Proof

l1) [todo] Run a 24-72 hour soak after the major residue cuts.

l2) [todo] Verify:
- app health remains green
- backend and worker have no restart loop
- queue depth/running depth stay normal
- locked cards continue arriving
- generation failures are explained by provider/content conditions, not local ownership bugs
- Supabase egress remains low and attributable only to intentional retained surfaces

l3) [todo] Move this plan to completed only after the ownership ledger says there is no unclassified mid-migration residue.

## Proof Gates

m1) [todo] Technical proof:
- `npm run typecheck`
- focused tests for each touched ownership domain
- `npm run build`
- docs freshness/link checks when docs are changed

m2) [todo] Runtime proof:
- Oracle queue health clean
- provider circuits healthy or explainable
- stale leases and stale processing rows bounded and recoverable
- no new leading Supabase product-table egress family from migrated domains

m3) [todo] Product proof:
- wall/For You loads correctly
- locked cards arrive and persist with correct timestamp semantics
- unlock/generation works
- likes/tags/profile/detail surfaces remain correct after their chapters
- launch-critical flows still work

## Rollback Rules

n1) [have] Prefer fix-forward for ownership bugs when the Oracle path is already primary and production-stable.

n2) [todo] Any rollback must be explicit, documented, and bounded. Do not reintroduce hidden dual-runtime behavior as a resting state.

n3) [todo] If a Supabase fallback must stay, it must log attribution and have a removal condition.

## First Implementation Recommendation

o1) [todo] Start with Session 0 and Session 1 before writing product-runtime changes:
- create the ownership ledger
- inventory current direct Supabase product-table residues
- decide which paused plans become the next concrete implementation chapter

o2) [todo] After the ledger/audit, the likely first code chapter is `blueprint_likes` because it is user-facing, social-runtime state and has a paused robust ownership plan already drafted.
