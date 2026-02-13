# Project 3 - Channel Following

Status: `active`

## Summary
Project 3 adds runtime channel-follow behavior and feed personalization while preserving existing tag-based discovery.

This is the behavior layer after:
- P1: IA + lingo (`channels` language)
- P2: feed density + channel-first row hierarchy

## Goal
Introduce `Join/Leave Channel` behavior and channel-prioritized feed ranking that creates a clear loop:
`discover -> join -> feed changes -> reinforce join`.

## In Scope
- follow/unfollow UX states on Explore and channel-like surfaces
- channel-prioritized feed ranking policy for Wall
- cold-start behavior for users with zero joined channels
- telemetry needed to validate behavior impact

## Out Of Scope
- user-created channels
- moderation systems beyond admin-owner model
- full recommendation engine
- backend schema redesign for channels in this phase

## Dependencies
- P1 terminology and taxonomy
- P2 feed row structure and compact list behavior

## Model Lock (Conceptual)
- Each blueprint can later map to up to `3` curated channels.
- Tags remain freeform for discovery/search.
- List rows later show primary channel + overflow indicator (`+N`) when multi-channel assignment is runtime-wired.
- Channel route pattern for MVP is `b/<channel-slug>`.
- `<channel-slug>` must resolve only to curated admin-owned channels.
- Unknown channel slugs should return channel 404 behavior.
- Legacy/no-channel blueprints use fallback lane label `b/general`.

## Runtime Contract (v0)
### Follow state machine
1. `not_joined`
2. `joining` (optimistic UI allowed)
3. `joined`
4. `leaving` (optimistic UI allowed)
5. `error` (rollback to prior stable state + toast)

### Feed ranking policy
1. If user has joined channels:
- apply joined-channel boost first
- dedupe by blueprint id across overlapping channels
- tie-break by recency
2. If joined-channel content is sparse:
- blend with global feed at fixed ratio (`joined-first`, then global fill)
3. If user has zero joined channels:
- keep global feed + clear join CTA path

### Cold-start policy
- show curated starter channels
- show one clear primary CTA: `Explore Channels`
- no dead-end state: always one action available

## 3-Step Implementation Plan
### Step 1 - Follow State + UI Wiring
Objective: make Join/Leave state consistent and reliable on core surfaces.

Tasks:
1. define and wire `not_joined/joining/joined/leaving/error` transitions.
2. apply state to Explore channel chips and relevant Wall prompts.
3. ensure optimistic transitions rollback correctly on errors.

Acceptance:
- state transitions are deterministic
- no stale visual state after action completes/fails
- join/leave reachable in <=2 taps from Explore

Step 1 implementation lock (2026-02-13):
- Core surfaces in scope: `Explore`, `Tags`, `Wall` empty-state channel suggestions.
- Explore interaction split is enforced:
  - channel chip click = search intent
  - separate `Join/Joined/Joining.../Leaving...` button = follow intent
- `TagFilterChips` is strict filter-only (no follow side effects).
- Logged-out join attempts show toast + inline sign-in CTA.
- `useTagFollows` exposes explicit `joinChannel`, `leaveChannel`, `getFollowState`, while `toggleFollow` is kept for compatibility in non-core surfaces.
- Phase 1 IA/routing lock:
  - `Channels` is a first-class nav destination.
  - route `/channels` is the channels index page.
  - route `/b/:channelSlug` is the canonical channel page shape.
  - legacy `/tags` route is deprecated and redirects to `/channels`.
  - unknown channel slugs render channel-specific 404 behavior.
  - join button is disabled with hint (`Channel activation pending`) when curated channel backing tag is missing.

### Step 2 - Feed Ranking + Cold-Start Behavior
Objective: make joins materially affect feed order while preserving stability.

Tasks:
1. implement joined-channel boost policy in feed selection.
2. implement dedupe for overlapping channel content.
3. implement sparse-data blend fallback with fixed policy.
4. lock cold-start branch for zero-join users.

Acceptance:
- joined-channel content is visibly prioritized in feed
- duplicates do not appear
- zero-join users always get actionable onboarding

Step 2 ranking/cold-start lock (2026-02-13):
- `For You` now uses joined-first ranking with deterministic global fill.
- `Latest` remains pure recency (no channel boost).
- `Trending` remains likes-first global (no channel personalization).
- Zero-join users still get a usable `For You` feed plus a clear inline CTA to `/channels`.

Phase 3 channels-only MVP lock (2026-02-13):
- Follow UX is curated-channels-only on user-facing surfaces.
- Tags are lookup/filter metadata only (no tag-level join/leave actions in Explore or Wall).
- `/channels` IA is now `Channels` (joined, capped with inline expand), `Suggested Channels` (always visible, popularity-ranked), and `More Channels`.
- Suggested channels include up to two lightweight blueprint previews for channel feel.
- Legacy non-curated follows are auto-cleaned on `/channels` load for signed-in users.

Phase 3 polish lock (2026-02-13):
- `Suggested Channels` preview label is shortened to `Explore`.
- Suggested preview cap is `3` titles max per channel.
- `b/<slug>` row label remains in joined `Channels` and is hidden in `Suggested`/`More` rows to reduce redundancy.
- Suggested rows hide the preview block when no preview items are available.

Step 2 Phase 2 implementation lock (2026-02-13):
- Channel pages are now real feed surfaces on `/b/:channelSlug` with `Top` and `Recent` tabs.
- `Top` uses likes-first ordering with deterministic recency tie-break.
- `Recent` uses created time descending.
- Paging is deterministic with `Load more` increments of 20 (full infinite deferred to Phase 2.1).
- Feed row context labels now resolve to real `b/<channel-slug>` values via exact+alias channel mapping.
- `b/general` is active as fallback lane and is read-only (non-joinable).
- Channel catalog includes icon metadata and priority for deterministic label resolution.

### Step 3 - Telemetry + Validation Gate
Objective: verify behavior impact and protect rollout quality.

Tasks:
1. Emit v0 event set into `mvp_events` for channel loop measurement.
2. Compute and review SUCC metrics for a fixed pilot window using a logs-first script.
3. Apply GO/HOLD/PIVOT decision with minimum-sample guardrails.

Acceptance:
- event coverage is complete for loop tracking
- SUCC thresholds are measurable and reported
- fallback trigger is documented and testable

Step 3 telemetry lock (2026-02-13):
- Event sink: `src/lib/logEvent.ts` -> Supabase Edge Function `log-event` -> `public.mvp_events`.
- Event version: `p3_step3_v0` in `metadata.event_version`.
- Session model: `metadata.session_id` is per-tab via `sessionStorage` (`bleu_session_id`).
- Impression events are once-per-session to prevent spam.

Event list (v0):
- `channels_index_view`
- `channel_page_view`
- `channel_join_click`
- `channel_join_success`
- `channel_join_fail` (bucketed)
- `channel_leave_success`
- `channel_suggested_impression`
- `channel_suggested_preview_click`
- `wall_zero_join_cta_impression`
- `wall_zero_join_cta_click`
- `wall_tag_filter_used` (normalized slug only)

Join error buckets (v0):
- `auth_required`
- `network`
- `constraint`
- `unknown`

Metrics reporting (v0):
- Command: `npm run metrics:channels -- --days 7 --json`
- Source: Supabase REST `mvp_events` using `SUPABASE_SERVICE_ROLE_KEY`.

Metric formulas (v0):
- Signed-in sessions: unique `session_id` where any event has `user_id != null`.
- `join_channel_rate` = signed-in sessions with >=1 `channel_join_success` / signed-in sessions.
- `time_to_first_join_sec` per session = earliest `channel_join_success` - earliest event in that session; report median + p95.
- `channel_page_visit_rate` = signed-in sessions with >=1 `channel_page_view` / signed-in sessions.
- `suggested_click_through_rate` = sessions with >=1 `channel_suggested_preview_click` / sessions with `channel_suggested_impression`.
- `zero_join_cta_click_rate` = sessions with `wall_zero_join_cta_click` / sessions with `wall_zero_join_cta_impression`.
- `join_fail_bucket_distribution` = counts of `channel_join_fail` grouped by `metadata.error_bucket`.

Decision gate (pilot v0):
- Window: 7 days.
- Minimum sample: >= 100 signed-in sessions before making GO/HOLD/PIVOT call.
- GO targets:
  - `join_channel_rate >= 25%`
  - `median time_to_first_join_sec <= 45`
  - `suggested_click_through_rate >= 15%` (starter target)
  - `join_fail_bucket_distribution` not dominated by `constraint` or `unknown`
- HOLD:
  - sample < 100 signed-in sessions or results noisy/inconclusive
- PIVOT:
  - `join_channel_rate < 10%` after >= 100 signed-in sessions, or `median time_to_first_join_sec > 120`

## SUCC Criteria (Numeric)
- `join_channel_rate >= 25%` (first-session signed-in users)
- `time_to_first_join <= 45s` median
- `followed_channel_posts_in_top10 >= 50%` for users with >=1 join
- `day7_users_with_joined_channel >= 20%`
- `zero_join_dead_end_rate = 0%`
- `follow_state_mismatch_rate < 1%`

## Rollout Guardrails
- gate behind feature flag
- if mismatch/error rates exceed threshold, disable ranking boost and keep join UX
- if feed quality degrades, fallback to global blend mode

## Edge Cases / Failure Modes
- channel has no recent content
- overlapping channel assignments cause potential duplicates
- follow state race between tabs/sessions
- temporary provider/query failures during ranking

## ST Checklist
- join/leave transitions work across all states (`not_joined/joining/joined/leaving/error`)
- feed order changes after join action
- no duplicate blueprints in prioritized feed
- zero-join state always has one actionable CTA
- fallback mode can be enabled without breaking feed

## Acceptance Criteria
- users can join channel in <=2 taps from Explore
- joined channels visibly influence top feed positions
- no dead-end zero-join experience
- state sync errors remain below threshold

## Done Definition
- state machine implemented and documented
- ranking policy implemented and validated
- telemetry events emitted and reviewed in pilot window
- rollback/fallback procedures validated

## Rollback Notes
- if ranking causes noise, disable boost and keep global blend
- keep join UI active even if ranking boost is off
- preserve telemetry during rollback to diagnose issues
