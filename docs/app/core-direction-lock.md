# Core Direction Lock (`bleuV1`)

Status: `canonical`

## Reference Status
- Legacy ASS/agentic seeding references are archived and non-runtime:
  - `docs/_archive/legacy-ass-agentic/README.md`
  - `docs/_archive/legacy-ass-agentic/agentic/README.md`
  - `docs/_archive/legacy-ass-agentic/ass_das/ASS_full.mmd`
  - `docs/_archive/legacy-ass-agentic/design-docs/ASS_simple.mmd`
  - `docs/_archive/legacy-ass-agentic/design-docs/seed_ass_spec.md`
  - `docs/_archive/legacy-ass-agentic/schemas/ass_eval_config_schema.md`
- Active product/runtime direction for `bleuV1` remains source-first YouTube-to-blueprint and is defined by this file plus canonical product/architecture docs.

## One-line promise
`bleuV1` gives you an automated feed of bite-sized blueprints from the media you follow, with automatic channel publishing for eligible items.

## Locked core (MVP)
1. Source-first product identity.
2. YouTube is the only required adapter in MVP.
3. `My Feed` is the personal default lane.
4. Home feed (`/wall`) is automatically populated from `My Feed` via auto-channel checks.
5. Community value is comments/votes/insights on blueprint content.
6. Channel routing mode is env-driven (`deterministic_v1` default, `llm_labeler_v1` optional) and falls back to `general` on ambiguous/invalid label output.
7. Feed/detail surfaces prioritize source-channel context for imported media over creator-edit workflows in MVP UI.
8. Profile visibility is public-by-default for new accounts (`profiles.is_public=true` default); existing privacy choices remain respected.
9. My Feed blueprint card badge label is normalized to `Blueprint`, and feed tags use the same one-row capped chip treatment as Home (without `#` prefix).
10. Signed-in primary nav is `Home / Channels / Explore`; search/create entrypoint is the header `Create` action to `/search`.
11. Subscriptions are reachable from both user dropdown (full page) and profile workspace owner tab (lightweight list).
12. Core high-traffic UI copy must use current runtime language (`Home`, `Create`, auto-channel publish) and avoid legacy manual-post wording.
13. `/subscriptions` is the only entrypoint for YouTube OAuth connect + bulk import in MVP; signup-step integration is deferred.
14. YouTube disconnect revokes+unlinks OAuth tokens but preserves existing app subscriptions.
15. Import selection defaults to none-selected, and import is idempotent with inactive-row reactivation.
16. New-account optional onboarding uses `/welcome` as a first-login setup entrypoint; existing accounts are not auto-prompted.
17. Onboarding completion requires successful subscription import (connect-only is insufficient).
18. Source identity is moving to platform-agnostic `Source Pages` (`/s/:platform/:externalId`), with YouTube channel `UC...` as the current canonical key.
19. Source pages are public-readable and subscribe/unsubscribe capable; legacy `/api/source-subscriptions*` endpoints remain compatibility-safe during migration.
20. Source pages may lazily hydrate missing avatar/banner metadata on first read so backfilled legacy rows render complete visuals without requiring unsubscribe/resubscribe.
21. Source pages include a public, read-only blueprint feed (`GET /api/source-pages/:platform/:externalId/blueprints`) that shows channel-published items only, deduped by source video and paginated via load-more cursor.
22. Source pages include an auth-only `Video Library` section for back-catalog generation (`GET /api/source-pages/:platform/:externalId/videos`, `POST /api/source-pages/:platform/:externalId/videos/unlock`, compatibility alias `/videos/generate`) and run generation asynchronously through existing My Feed + auto-channel pipeline.
23. Source-page Video Library filter UX is two-tab in MVP (`Full videos` and `Shorts`), with shorts classified by duration threshold `<=60s`.
24. Source-page Video Library list traffic uses dual guardrails in backend (burst + sustained per-user/IP) so normal tab/list interaction is smooth while abuse remains capped.
25. Shared source-video unlock is the default generation model for new source-page requests: one source item can be generated once and reused across subscribers.
26. Credit policy is a daily UTC-reset wallet (`free=3.00`, `plus=20.00`, no rollover) with reserve-first manual billing, settle at first model dispatch, and release on pre-generation failure.
27. Backend OpenAI SDK loading is lazy at call time; startup-critical backend modules must not depend on top-level `openai` ESM imports on Oracle.
28. Source-page unlock request control is soft-limited (burst+sustained) with credits as the primary user-facing throttle; strict unlock cooldown is not used.
29. Home scope split is fixed for MVP: `For You` is the subscribed-source stream (locked + unlocked, latest-only) and `Your channels` preserves the followed-channel ranking lane.
30. Unlock status visibility must be consistent across Home, Source Page, and My Feed using a shared activity/status pattern with reload-resume support.
31. Credits panel should load lazily on open, show daily reset timing, and keep debit/refund visibility without background polling from always-mounted UI.
32. Home should provide first-time scope clarity (`For You` vs `Your channels`) with dismissible helper copy.
33. Unlock backend reliability uses safe auto-fix sweeps (expired/stale/orphan recovery) with idempotent refund/fail transitions; no destructive cleanup.
34. Unlock/generate responses must include additive `trace_id` and unlock lifecycle logs must propagate that trace through request -> queue/job -> terminal outcome.
35. Unlock/manual/service generation execution is queue-first with durable DB claim+lease workers, bounded retries, and queue backpressure/intake controls (Oracle + Supabase only).
36. Subscription rows include `auto_unlock_enabled` (default `true`) and only new incoming subscription videos can auto-attempt unlock generation; runtime auto billing is funded-subscriber shared-cost with participant snapshotting, fixed-point funded-subset selection, bounded retries, and admin-bypass-safe funding, while historical locked backlog is not auto-processed.
37. Transcript-unavailable unlocks must not hard-fail user trust flows: manual unlock returns deterministic `TRANSCRIPT_UNAVAILABLE` with retry timing and auto-unlock retries are deferred with cooldown.
38. Read-heavy status endpoints (`/api/credits`, `/api/ingestion/jobs/latest-mine`) must use dedicated soft read limits and be excluded from generic global limiter paths to avoid accidental unlock UX 429 spikes.
39. Unlock queue items carry explicit `unlock_origin` metadata (`manual_unlock`, `subscription_auto_unlock`, `source_auto_unlock_retry`) for recovery and traceability.
40. Profile workspace tabs are locked to `Feed / Comments / Liked`; subscriptions management remains a dedicated page (`/subscriptions`) and not a profile tab.
41. Blueprint feed cards are interaction-minimal in MVP (like/comment only; no share action button).
42. Subscription sync must skip pre-release YouTube premieres (`upcoming`) so unreleased videos do not appear as unlock cards before publish.
43. If a sync batch contains skipped upcoming premieres, subscription checkpoint advancement is held for that run to avoid missing those videos once they release.
44. Permanent no-transcript source videos (`NO_TRANSCRIPT_PERMANENT` / legacy `NO_CAPTIONS`) must not remain as unlockable feed cards; only transient transcript-unavailable cases may retry.
45. YouTube-source banners are thumbnail-first across feed/detail/source surfaces: source flows should write/use thumbnail URLs (stored source thumbnail or deterministic `ytimg` fallback) and should not rely on auto-banner queueing.
46. Transcript truth classification must avoid one-shot permanence: ambiguous `NO_CAPTIONS` failures stay retryable until bounded multi-attempt confirmation marks `NO_TRANSCRIPT_PERMANENT` and hides the item from unlock surfaces.
47. Auto subscription transcript failures must stay silent on feed surfaces: retry with bounded backoff and suppress locked cards until success; speech-guidance warnings are reserved for explicit Source Page `+Add` attempts.
48. Notifications MVP scope is intentionally narrow: notify on comment replies and generation terminal outcomes, surfaced in a header bell inbox with read/read-all controls and an event-mapper backend contract for future expansion.
49. Launch gate hardening requires explicit credit-backend outage behavior (`CREDITS_UNAVAILABLE`, HTTP `503`) and must not silently fail-open credit-dependent flows.
50. Launch-critical UX copy for generation failures must be normalized via shared frontend mapping (no raw backend/internal payload leakage on key surfaces).
51. Source-page read surfaces must fail safely: opportunistic asset-sweep hooks are allowed, but missing dependency wiring must never crash API process uptime.

## Core user journey
1. Subscribe to a YouTube channel or search/select a video.
2. Generate/import blueprint into `My Feed`.
3. System auto-evaluates and posts eligible blueprints to channels.
4. Engage through community interactions in Home lanes (`For You`, `Your channels`, and channel scopes).
5. Use profile workspace (`/u/:userId`) tabs `Feed / Comments / Liked` for personal history; `/my-feed` remains a compatibility/direct route.

## What is not core right now
1. Library-first creation is deprecated as primary identity.
2. Legacy inventory/library routes remain compatibility paths only.
3. Multi-adapter rollout (PDF/audio/etc.) is deferred.

## Deprecation policy
1. Keep compatibility routes/components until post-MVP cleanup.
2. Do not market or position library flow as primary product path.
3. If docs conflict on identity, this file + canonical docs win.

## Canonical references
- Product: `docs/app/product-spec.md`
- Architecture: `docs/architecture.md`
- Active proof-only tracker: `docs/exec-plans/active/mvp-launch-proof-tail.md`
- Completed implementation tracker: `docs/exec-plans/completed/mvp-readiness-review-followup.md`
- Paused strategy playbook: `docs/exec-plans/active/on-pause/bleuv1-mvp-hardening-playbook.md`
- Runbook: `docs/ops/yt2bp_runbook.md`

## Latest Update (2026-03-05)
1. YouTube source comments keep stored-snapshot UX; no live page-load fetches were introduced.
2. Refresh policy is bootstrap-first (`+15m`, `+24h`) then user-triggered manual refresh with per-blueprint cooldown.
3. Supabase project targeting is aligned to `qgqqavaogicecvhopgan`, and shared auto-unlock schema migrations `20260306113000` and `20260306170000` are applied there.
4. Search/manual-refresh/source-page generation now share backend preflight helpers for subscription access, duplicate classification, reservation-prefix handling, and queue admission without changing public route contracts.
5. `Subscriptions` and `Wall` page orchestration now compose dedicated frontend controller hooks, keeping render behavior stable while removing route/query/mutation ownership from the page files themselves.
6. `Wall` no longer assembles feed rows through browser-side Supabase fan-out; it consumes backend-shaped feed endpoints for both public lanes and `For You`.
