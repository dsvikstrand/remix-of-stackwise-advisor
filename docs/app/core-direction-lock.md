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

## Feed Model Lock
- Canonical feed model reference:
  - `docs/app/mvp-feed-and-channel-model.md`
- Home lanes are locked for MVP as:
  - `For You`: personal source-driven lane with locked + unlocked items
  - `Joined`: auth-only published-blueprint lane filtered by joined Bleu channels
  - `All`: global published-blueprint aggregation across Bleu channels
- Locked items belong only in `For You`.
- `Joined` and `All` contain only generated and published blueprints.
- Source subscriptions and Bleu channel joins are separate concepts and must stay separate in product language and implementation.

## Locked core (MVP)
1. Source-first product identity.
2. YouTube is the only required adapter in MVP.
3. Home feed (`/wall`) with `For You` is the personal default lane.
4. `/my-feed` is a legacy compatibility route that redirects to `/wall` and is not a primary product surface.
5. Community value is comments/votes/insights on blueprint content.
6. Channel routing mode is env-driven (`deterministic_v1` default, `llm_labeler_v1` optional) and falls back to `general` on ambiguous/invalid label output.
7. Feed/detail surfaces prioritize source-channel context for imported media over creator-edit workflows in MVP UI.
8. Profile visibility is public-by-default for new accounts (`profiles.is_public=true` default); existing privacy choices remain respected.
9. Legacy `My Feed` compatibility blueprint cards keep the normalized `Blueprint` badge label and same one-row capped chip treatment as Home (without `#` prefix).
10. Signed-in primary nav is `Home / Channels / Explore`; search/create entrypoint is the header `Create` action to `/search`.
11. Subscriptions are reachable from both user dropdown (full page) and profile workspace owner tab (lightweight list).
12. Core high-traffic UI copy must use current runtime language (`Home`, `Create`, auto-channel publish) and avoid legacy manual-post wording.
13. `/subscriptions` and new-account `/welcome` both use the manual-first creator setup flow in MVP; legacy YouTube OAuth onboarding is not the primary path.
14. YouTube disconnect revokes+unlinks OAuth tokens but preserves existing app subscriptions.
15. Import selection defaults to none-selected, and import is idempotent with inactive-row reactivation.
16. New-account optional onboarding uses `/welcome` as a first-login setup entrypoint; existing accounts are not auto-prompted.
17. Onboarding creator setup is optional; completion requires joining at least one Bleu channel, not importing YouTube subscriptions.
18. Source identity is moving to platform-agnostic `Source Pages` (`/s/:platform/:externalId`), with YouTube channel `UC...` as the current canonical key.
19. Source pages are public-readable and subscribe/unsubscribe capable; legacy `/api/source-subscriptions*` endpoints remain compatibility-safe during migration.
20. Source pages may lazily hydrate missing avatar/banner metadata on first read so backfilled legacy rows render complete visuals without requiring unsubscribe/resubscribe.
21. Source pages include a public, read-only blueprint feed (`GET /api/source-pages/:platform/:externalId/blueprints`) that shows channel-published items only, deduped by source video and paginated via load-more cursor.
22. Source pages include an auth-only, user-triggered `Video Library` section for back-catalog generation (`GET /api/source-pages/:platform/:externalId/videos`, `POST /api/source-pages/:platform/:externalId/videos/unlock`) and run generation asynchronously through the existing personal-lane + auto-channel pipeline.
23. User-facing Source Page `Video Library` copy should frame the library as an optional browse-when-ready feature, not expose internal quota/API-fetch implementation details.
24. Source-page Video Library filter UX is two-tab in MVP (`Full videos` and `Shorts`), with shorts classified by duration threshold `<=60s`.
25. Source-page Video Library list traffic uses dual guardrails in backend (burst + sustained per-user/IP) so normal tab/list interaction is smooth while abuse remains capped.
26. Shared source-video unlock is the default generation model for new source-page requests: one source item can be generated once and reused across subscribers.
27. Credit policy is a daily UTC-reset wallet (`free=3.00`, `plus=20.00`, no rollover) with reserve-first manual billing, settle at first model dispatch, and release on pre-generation failure.
28. Backend OpenAI SDK loading is lazy at call time; startup-critical backend modules must not depend on top-level `openai` ESM imports on Oracle.
29. Source-page unlock request control is soft-limited (burst+sustained) with credits as the primary user-facing throttle; strict unlock cooldown is not used.
30. Home feed contract is fixed for MVP:
    - `For You` is the subscribed-source lane plus personally unlocked blueprints, latest-first, and may contain locked + unlocked items.
    - `Joined` is the auth-only published-blueprint lane filtered by joined Bleu channels.
    - `All` is the global published-blueprint aggregation across Bleu channels.
31. A manually unlocked blueprint from a non-subscribed source must appear in that user’s `For You`, but future videos from that source do not enter `For You` unless the user subscribes.
32. Unlock status visibility must be consistent across Home, Source Page, and any legacy `My Feed` compatibility flow using a shared activity/status pattern with reload-resume support.
33. Credits panel should load lazily on open, show daily reset timing, and keep debit/refund visibility without background polling from always-mounted UI.
34. Home should provide first-time scope clarity (`For You`, `Joined`, and `All`) with dismissible helper copy where needed.
35. Unlock backend reliability uses safe auto-fix sweeps (expired/stale/orphan recovery) with idempotent refund/fail transitions; no destructive cleanup.
36. Unlock/generate responses must include additive `trace_id` and unlock lifecycle logs must propagate that trace through request -> queue/job -> terminal outcome.
37. Unlock/manual/service generation execution is queue-first with durable DB claim+lease workers, bounded retries, and queue backpressure/intake controls (Oracle + Supabase only).
38. Subscription rows include `auto_unlock_enabled` (default `true`) and only new incoming subscription videos can auto-attempt unlock generation; runtime auto billing is funded-subscriber shared-cost with participant snapshotting, fixed-point funded-subset selection, bounded retries, and admin-bypass-safe funding, while historical locked backlog is not auto-processed.
39. Transcript-unavailable unlocks must not hard-fail user trust flows: manual unlock returns deterministic `TRANSCRIPT_UNAVAILABLE` with retry timing and auto-unlock retries are deferred with cooldown.
40. Read-heavy status endpoints (`/api/credits`, `/api/ingestion/jobs/latest-mine`) must use dedicated soft read limits and be excluded from generic global limiter paths to avoid accidental unlock UX 429 spikes.
40a. User-scoped ingestion status routes must stay egress-conscious: `latest-mine` should avoid redundant active-then-latest double reads, and `active-mine` queue-position scans should narrow to the requested or currently visible queued scopes rather than scanning all queue scopes by default.
40b. User-scoped unlock restore should remain conservative by default: `latest-mine` should cap its recent-row read tightly (`2` rows in the current baseline), and passive consumers like Home `For You` must not force eager resume refetches on mount when the shared freshness window already covers the active state.
41. Unlock queue items carry explicit `unlock_origin` metadata (`manual_unlock`, `subscription_auto_unlock`, `source_auto_unlock_retry`) for recovery and traceability.
42. Profile workspace tabs are locked to `Feed / Comments / Liked`; subscriptions management remains a dedicated page (`/subscriptions`) and not a profile tab.
43. Profile `Feed` is read-only personal history for generated blueprints and subscribed creators; operational controls remain on Home `For You`, while `/my-feed` is compatibility-only.
44. Blueprint feed cards are interaction-minimal in MVP (like/comment only; no share action button).
45. Subscription sync must skip pre-release YouTube premieres (`upcoming`) so unreleased videos do not appear as unlock cards before publish.
46. If a sync batch contains skipped upcoming premieres, subscription checkpoint advancement is held for that run to avoid missing those videos once they release.
47. Ready-blueprint duplicate handling must upgrade an existing per-user locked feed row into a blueprint-backed row when search/manual generation discovers a reusable ready blueprint for that same source item; user-facing surfaces must not stay stuck on `Unlock available` after backend dedupe decides `skipped_existing`.
47. Source-item truth may be staged behind the Oracle durable source-item ledger (`ORACLE_SOURCE_ITEM_LEDGER_MODE=supabase|dual|primary`), but Supabase remains the compatibility shadow until that ledger is explicitly promoted; user-facing source/feed behavior must stay consistent across both stores during the rollout, and any Oracle-side source-item read regression must fail safely back to `supabase` mode before re-staging.
   - Source-page video-library follow-up reads must also reflect queued/running `source_item_blueprint_variants` state, so `GET /api/source-pages/:platform/:externalId/videos` stays consistent with `POST /videos/unlock` and marks already-running source videos as `unlock_in_progress=true` / `unlock_status=processing` even before unlock-row state changes.
   - `resolveVariantOrReady(...)=needs_generation` must not be coerced into `processing`; only real queued/running variant states may surface as `unlock_in_progress=true` on Source Page reads.
   - During `supabase|dual` source-item rollout, Oracle-first source-item reader failures must degrade to Supabase-backed reads instead of breaking wall/source-page/unlock traffic, and any future `dual -> primary` promotion must be gated by both parity and a live wall/source-page consistency canary.
   - Once source-item runtime is in `primary`, the durable Oracle source-item ledger is the normal Oracle-side reader for by-id and by-video lookups; the product-source-item mirror remains compatibility/bootstrap state and should not be treated as the steady-state source-item reader.
   - Source-page unlock prepare failures must never be reported back to the client as generic `in_progress` when no work was actually queued, including impossible cases where the returned unlock row is still `available`; Oracle-primary unlock wrappers should fall back to the durable Supabase mutation path and return an explicit failure bucket if preparation still cannot complete. That fallback path must also normalize legacy `transcript_probe_meta = null` unlock rows back to `{}` so the Supabase shadow write remains schema-valid.
48. Supabase edge functions that the browser calls directly must echo the requesting allowed web origin (`https://bleup.app`, `https://www.bleup.app`, local dev, and explicit preview origins when intentionally enabled) and must not default browser CORS responses to one stale preview site.
49. Permanent no-transcript source videos (`NO_TRANSCRIPT_PERMANENT` / legacy `NO_CAPTIONS`) must not remain as unlockable feed cards; only transient transcript-unavailable cases may retry.
50. YouTube-source banners are thumbnail-first across feed/detail/source surfaces: source flows should write/use thumbnail URLs (stored source thumbnail or deterministic `ytimg` fallback) and should not rely on auto-banner queueing.
51. Subscription sync persistence is write-throttled for backend efficiency: unchanged successful sync writes to `user_source_subscriptions` should be skipped unless checkpoint/title/error state changes, while repeated identical error writes remain bounded by the `30m` poll heartbeat; user-facing subscription health remains a `60m` UX window.
   - queue depth/work-item helper reads must honor explicit `scope`/`scopes` filters so queue guards and health checks do not silently scan the full ingestion queue when a narrower slice is intended.
   - service-cron subscription ingestion may still trigger every `3m`, but in Oracle `primary` the live owner for `all_active_subscriptions` is the Oracle-local scheduler tick; external trigger calls for that scope should no-op unless explicitly marked as Oracle-owned, and backend enqueue must still respect the Oracle cadence window (`ORACLE_SUBSCRIPTION_PRIMARY_MIN_TRIGGER_INTERVAL_MS`).
   - hard subscription failures must persist readable `message/code/details` text into `last_sync_error` and batch terminal summaries; coercing object-shaped failures to `[object Object]` is considered a production observability bug because it hides the real cron blocker.
49a. Low-priority queue claim polling must stay egress-conscious: idle claim sweeps for low-priority scopes should back off more aggressively than the default worker idle cadence, while claimed-work reschedules and lease-heartbeat semantics remain unchanged.
49b. High-priority user-triggered generation scopes (`source_item_unlock_generation`, `search_video_generate`, `manual_refresh_selection`) must still feel interactive under Oracle queue control: a fresh manual enqueue may clear Oracle-local sweep/claim cooldowns for its own high-priority sweep key before waking the worker, instead of waiting behind empty-sweep backoff intended for background work.
49b. Service-cron ingestion trigger hot paths must stay skinny: `/api/ingestion/jobs/trigger` may keep conflict-focused stale-running recovery, but it must not run opportunistic unlock sweeps, source-page asset sweeps, or transcript revalidate seeding before enqueue eligibility is known.
49c. Manual refresh candidate rescans should stay simple and additive: failed items must not depend on a persisted `refresh_video_attempts` cooldown table to disappear from future scans, and unsubscribe flows must not require extra subscription-notice cleanup writes for correctness.
49d. Queue maintenance must stay cadence-aware after the first hardening pass: low-priority/combined worker loops may still run unlock sweeps and stale-job recovery, but that maintenance should be time-gated to a coarse interval (`15m` default) instead of rerunning on every idle claim cycle.
49e. `all_active_subscriptions` breadth must stay bounded but Oracle-tunable: the runtime may still process the full corpus eventually, but each run should prioritize Oracle-local due rows first, cap the per-batch slice through `ORACLE_SUBSCRIPTION_PRIMARY_BATCH_LIMIT` (`150` current default in `primary`), and cap multi-batch drain through `ORACLE_SUBSCRIPTION_PRIMARY_MAX_BATCHES_PER_RUN` (`2` current default) so subscription refresh cost and backlog clearance remain explicit control-plane choices.
49f. Lease maintenance should also prefer delayed startup over extra writes for short-lived maintenance scopes: fast retry/enrichment jobs may defer their first heartbeat until later in the lease window (`45s` on the default `90s` lease), while heavier generation/subscription scopes keep the normal baseline.
49g. Queue-claim control may now live on Oracle: repeated empty claim attempts should be throttled by Oracle-local cooldown state (`ORACLE_QUEUE_*`) with stronger backoff for medium/low-priority tiers, while Supabase remains the durable source of queued/running rows, claim ownership, retries, and lease truth.
49h. Queue-worker mirror upkeep should prefer known-row updates over extra ledger rereads: when the worker already holds a claimed `ingestion_jobs` row, failure retry transitions and lease-heartbeat mirror refreshes should update Oracle from that row instead of re-querying Supabase just to keep queue-health and active-job mirrors fresh.
49i. Ingestion route handlers should stay thin once Oracle-first readers exist: user job-detail/status routes and orphan unlock-job failure recovery should reuse centralized Oracle-aware helpers instead of keeping their own direct `ingestion_jobs` fallback/update logic in the route or sweep layer.
49j. Service ops reads and refresh dedupe must follow the same rule: latest-job, queue-health, and Blueprint refresh pending checks should consume centralized Oracle-first helpers, with any durable Supabase fallback hidden underneath runtime helpers rather than duplicated in handlers/services.
49. Transcript truth classification must avoid one-shot permanence: ambiguous `NO_CAPTIONS` failures stay retryable until bounded multi-attempt confirmation marks `NO_TRANSCRIPT_PERMANENT` and hides the item from unlock surfaces.
49k. Short-transcript failures (`TRANSCRIPT_INSUFFICIENT_CONTEXT`) are not permanent no-transcript truth, but they should still enter the existing blueprint-unavailable cooldown lane for requeue attempts and must not keep resurfacing as normal locked `Unlock available` cards on Home/Profile during that cooldown.
49l. Fresh `source_item_unlocks` rows must initialize `transcript_status='unknown'`; subscription sync and Oracle-primary/shared unlock row builders must not persist null transcript-truth fields, because that now breaks cron progress on the durable unlock table contract.
49m. User-triggered YT2BP work that enters the queue (`source_item_unlock_generation`, `search_video_generate`, `manual_refresh_selection`) must preserve its interactive request class through the queued worker: interactive runs may use tighter transcript/LLM retry budgets plus additive stage-timing telemetry, while background ingestion keeps the slower resilience profile.
50. Known-channel YouTube video-library listing (`/api/youtube/channels/:channelId/videos`, `/api/source-pages/:platform/:externalId/videos`) must use the low-cost uploads-playlist path (`channels.list -> playlistItems.list`) rather than `search.list`; broad keyword discovery remains the quota-heavy surface.
51. Auto subscription transcript failures must stay silent on feed surfaces: retry with bounded backoff and suppress locked cards until success; speech-guidance warnings are reserved for explicit Source Page `+Add` attempts.
52. Notifications MVP scope is intentionally narrow: notify on comment replies and generation terminal outcomes, surfaced in a header bell inbox with read/read-all controls and an event-mapper backend contract for future expansion; terminal unlock-generation failures should still surface as `generation_failed` even when transcript retry policy remains active.
53. Launch gate hardening requires explicit credit-backend outage behavior (`CREDITS_UNAVAILABLE`, HTTP `503`) and must not silently fail-open credit-dependent flows.
54. Launch-critical UX copy for generation failures must be normalized via shared frontend mapping (no raw backend/internal payload leakage on key surfaces).
55. Source-page read surfaces must fail safely: opportunistic asset-sweep hooks are allowed, but missing dependency wiring must never crash API process uptime.
56. Oracle MVP production runtime is single-service combined mode (`agentic-backend.service` with HTTP + background work together); dedicated split worker topology is deferred until a later scale pass proves it necessary.
57. Oracle backend runtime config is locked to `/etc/agentic-backend.env`; repo-root `.env` is local-only fallback for non-systemd runs and backend bootstrap must not depend on `.env.production`.
58. Shared transcript proxy runtime for opted-in providers is explicit-endpoint-only for MVP; legacy Webshare selector/list modes are removed from active runtime, while historical transport metadata remains read-compatible.
59. Installed-PWA web push is now a gated extension of the existing notifications model: only `comment_reply`, `generation_succeeded`, and `generation_failed` are eligible, opt-in is explicit from notification surfaces, and rollout remains behind push feature/env flags until device validation is complete.
60. Oracle control-plane operations for MVP (instance inspection/reboot) must use the standardized OCI API-signing-key workflow in `docs/ops/oracle-cli-access.md`; ad hoc local note files are not part of the canonical ops contract.
61. Transcript fetch now defaults to `youtube_timedtext` first and may fall through to `videotranscriber_temp`, then `transcriptapi`, only through the existing transcript-provider seam when YouTube captions are unavailable.
61a. `videotranscriber_temp` may perform one bounded local key/session renew attempt on early service-related failures (`runtime_config`, `url_info`, `start`) before the outer fallback policy continues; this does not change the broader pipeline retry contract.
62. Temporary local/dev transcript fallbacks are allowed only behind the existing transcript-provider seam; they must be explicitly marked non-production and must not silently redefine Oracle/live runtime truth.
63. Search-page video entry should behave as direct lookup, not open-ended discovery: URL and video-id input are preferred, title lookup is bounded to a single confident match through helper providers, and broad paginated keyword search is not the primary app behavior.
64. Creator lookup should also behave as bounded find-this-one flow: channel URL, handle, and channel id are preferred inputs; creator-name lookup is helper-backed, returns only a tiny candidate set, and must not depend on official `search.list`.
65. Public/list blueprint cards must use stored `blueprints.preview_summary` teaser text; list/feed/search surfaces should not reload canonical `sections_json` just to recover the first summary lines.
66. Blueprint YouTube refresh bookkeeping must stay egress-conscious: scheduler pending-job checks should batch by refresh kind/candidate set, and manual refresh entrypoints must not rewrite refresh-state rows when an enabled row already exists.
67. Queue lease maintenance must also stay egress-conscious: worker heartbeats should refresh on a lease-aware cadence instead of a fixed chatty interval, while preserving the same lease ownership semantics.
68. Durable generation trace writes must stay egress-conscious: avoid per-event sequence lookups and avoid returning trace row payloads on writes when the caller does not use them.
69. Static-ish frontend read surfaces (`Wall`, `Search`, `Explore`, channel feeds, blueprint detail/comments, profile tabs) must use explicit conservative TanStack Query freshness windows with no focus-triggered refetch by default; only live/semi-live surfaces should opt into tighter behavior.
70. `GET /api/my-feed` is retained as a legacy compatibility endpoint only; it is no longer the active primary read surface now that `/my-feed` redirects to `/wall`.
71. YouTube refresh bookkeeping must avoid no-op persistence: unchanged source-item `view_count` fetches must not rewrite metadata just to refresh fetch timestamps, and refresh-state rows should only upsert when a meaningful persisted field changes.
72. The default one-step YT2BP prompt contract is now `docs/golden_blueprint/golden_bp_prompt_contract_one_step_v5.md`: it keeps the same `blueprint_sections_v1` runtime shape, but `Takeaways` should bias toward plain-English fast-skim value, `Storyline` should stay at `2-3` substantial paragraphs/slides rather than thin fragments, and the existing `open_questions` field should carry a human-facing `Caveats` section.
73. Display/render surfaces should now label that final section as `Caveats`, while runtime/storage keys stay `open_questions` and legacy `Open Questions` titles remain accepted as compatibility aliases.
74. YT2BP `llm_native` quality retries now reserve regeneration for blocking structure/shape misses; `TAKEAWAYS_TOO_LONG` remains logged as soft quality telemetry but does not trigger retry by itself.
75. Queue-backed source-video generation must retain claim ownership and bounded recovery: `source_item_blueprint_variants` should record the active ingestion job when work is claimed, stale queued/running variants with no `active_job_id` must become reclaimable after a bounded timeout, unlock-generation preflight must treat same-job ownership as resumable work rather than generic `in_progress`, and terminal `generation_runs` status persistence must not depend on best-effort trace-event writes.
76. Oracle control-plane runtime may initialize and update local SQLite scheduler state behind `ORACLE_CONTROL_PLANE_*` env flags, and `primary` mode may own `all_active_subscriptions` enqueue admission, cadence timing, external-trigger ownership, and batch selection only; Oracle queue-control may also own empty-claim backoff/cooldown decisions behind `ORACLE_QUEUE_*` env flags, Oracle queue-sweep control may own queued-worker tier cadence, sweep selection, and tier batch sizing behind `ORACLE_QUEUE_SWEEP_*` env flags, Oracle queue-admission mirror state may serve hot queue-depth/backpressure reads behind `ORACLE_QUEUE_ADMISSION_*` env flags, and Oracle job-activity mirror state may serve Oracle-first stale-running recovery, manual-refresh duplicate guards, retry/refresh pending-job dedupe, unlock-reliability job lookups, active `all_active_subscriptions` duplicate guards, owner-scoped `GET /api/ingestion/jobs/:id`, Oracle-backed queue-position reads for `GET /api/ingestion/jobs/active-mine`, and user/ops latest-job status reads behind `ORACLE_JOB_ACTIVITY_*` env flags.
   - Oracle job-activity mirror lifecycle writes should prefer known rows from enqueue/claim/terminal/stale transitions over Supabase read-after-write refreshes whenever the hot path already has the durable `ingestion_jobs` row in hand.
   - Oracle queue-ledger ownership may now progress separately behind `ORACLE_QUEUE_LEDGER_MODE=supabase|dual|primary`: `dual` keeps Supabase as the live durable ledger while shadowing a local SQLite queue ledger, and `primary` now lets Oracle own claim/lease/fail/finalize transitions while Supabase remains a compatibility shadow.
   - Once that queue ledger is live, queue depth/work-item/status reads may now also resolve from Oracle first, so admission/health/latest checks no longer need to prefer Supabase in the normal control path.
   - Oracle-local queue-admission and job-activity mirrors should now refresh from that Oracle queue ledger first as well, rather than treating Supabase as the bootstrap source after the ledger cutover.
   - Once queue-ledger `primary` is live, the normal hot-path queue/job reads should prefer that Oracle queue ledger directly; queue-admission and job-activity mirrors become fallback/bootstrap compatibility state rather than the main runtime source.
   - Oracle durable subscription truth may now also progress separately behind `ORACLE_SUBSCRIPTION_LEDGER_MODE=supabase|dual|primary`: `dual` bootstraps and shadows `user_source_subscriptions` into local SQLite, while `primary` lets Oracle own subscribe/reactivate/unsubscribe/checkpoint/error updates and Oracle-first subscription reads, with Supabase retained as the compatibility shadow underneath.
   - Oracle durable unlock truth may now also progress separately behind `ORACLE_UNLOCK_LEDGER_MODE=supabase|dual|primary`: `dual` bootstraps and shadows `source_item_unlocks` into local SQLite, while `primary` lets Oracle own unlock reservation/processing/ready/transcript-retry updates and Oracle-first unlock reads, with Supabase retained as the compatibility shadow underneath and wallet/generation truth staying on Supabase.
   - Oracle durable feed truth may now also progress separately behind `ORACLE_FEED_LEDGER_MODE=supabase|dual|primary`: `dual` bootstraps and shadows `user_feed_items` into local SQLite, while `primary` lets Oracle-backed feed rows drive wall/profile/public feed reads and shared feed mutation paths with Supabase retained as the compatibility shadow underneath.
   - The `dual` unlock-ledger soak now has an explicit parity gate: `npm run ops:oracle-unlock-parity -- --json` should show no missing Oracle/Supabase unlock rows, no duplicate `source_item_id` keys, and no durable-field mismatches before `ORACLE_UNLOCK_LEDGER_MODE` flips to `primary`.
   - Unlock-ledger bootstrap/sync must page through Supabase in batches rather than trusting a single large `limit(...)` read, so Oracle can hydrate the full configured `ORACLE_UNLOCK_LEDGER_BOOTSTRAP_LIMIT` instead of silently truncating at the backend page cap.
   - Once unlock-ledger `primary` is live, unlock-specific truth reads and mutation preconditions should prefer the Oracle unlock ledger directly; the older product-unlock mirror remains a compatibility/read-plane helper, not the normal source for unlock-by-id or unlock-by-source-item lookups.
   - Queue-ledger helpers should keep that bridge centralized too: claim, fail, and lease-touch paths must expose Oracle-aware hook points in `ingestionQueue` so worker/controller code does not re-scatter mirror updates or fallback behavior across callers.
   - User-triggered generation/sync handlers must now also stay on that centralized Oracle-aware lifecycle path: manual refresh, source-page unlock generation, search generation, and foreground subscription sync should enqueue/finalize through shared helpers instead of inline `ingestion_jobs` inserts or updates in route/handler code.
   - Service/debug ingestion control should follow the same rule: `/api/ingestion/jobs/trigger` and debug subscription simulation should enqueue/finalize through the shared Oracle-aware helpers rather than keeping their own direct `ingestion_jobs` write branches.
   - Oracle product-state mirroring may now progress separately behind `ORACLE_PRODUCT_MIRROR_*`: Oracle may mirror active subscriptions, recent source items, source-item unlock rows, and recent feed rows into local SQLite so source-page subscription/access checks, blueprint-cooldown decisions, unlock-status lookups, public wall/source-page blueprint feeds, and wall/profile feed-history hydration can prefer Oracle-first reads when the mirror is sufficiently complete. Hot subscription/feed/unlock mutations should keep that product mirror warm from known rows or targeted reloads, while Supabase remains the durable product ledger and fallback path underneath.
   - Supabase must remain the durable queue truth for leases, checkpoints, reservations/intents, queued/running rows, retries, and user-facing writes until a later explicit migration phase moves those domains too.

## Core user journey
1. Subscribe to a YouTube channel or look up one specific video by link, video id, or title.
2. Generate/import blueprint into Home `For You`.
3. System auto-evaluates and posts eligible blueprints to channels.
4. Engage through community interactions in Home lanes (`For You`, `Joined`, `All`, and channel scopes).
5. Use profile workspace (`/u/:userId`) tabs `Feed / Comments / Liked` for personal history; `/my-feed` remains a compatibility redirect only.

## What is not core right now
1. Library-first creation is deprecated as primary identity.
2. Legacy inventory/library routes remain compatibility paths only.
3. Multi-adapter rollout (PDF/audio/etc.) is deferred.
4. Historical Oracle/Paperspace transcript-bridge schema (`public.transcript_requests`) remains in Supabase migration history for parity only and is not part of the current transcript-provider launch contract.

## Deprecation policy
1. Keep compatibility routes/components until post-MVP cleanup.
2. Do not market or position library flow as primary product path.
3. If docs conflict on identity, this file + canonical docs win.

## Canonical references
- Product: `docs/app/product-spec.md`
- Feed model: `docs/app/mvp-feed-and-channel-model.md`
- Architecture: `docs/architecture.md`
- Active proof-only tracker: `docs/exec-plans/active/tail/mvp-launch-proof-tail.md`
- Completed implementation tracker: `docs/exec-plans/completed/mvp-readiness-review-followup.md`
- Historical strategy playbook: `docs/exec-plans/completed/bleuv1-mvp-hardening-playbook.md`
- Runbook: `docs/ops/yt2bp_runbook.md`

## Latest Update (2026-03-05)
1. YouTube source comments keep stored-snapshot UX; no live page-load fetches were introduced.
2. Refresh policy keeps bounded auto freshness (`+15m`, `+24h`) while allowing owner-triggered manual refresh immediately, subject to a short per-blueprint cooldown.
3. Supabase project targeting is aligned to `qgqqavaogicecvhopgan`, and shared auto-unlock schema migrations `20260306113000` and `20260306170000` are applied there.
4. Search/manual-refresh/source-page generation now share backend preflight helpers for subscription access, duplicate classification, reservation-prefix handling, and queue admission without changing public route contracts.
5. `Subscriptions` and `Wall` page orchestration now compose dedicated frontend controller hooks, keeping render behavior stable while removing route/query/mutation ownership from the page files themselves.
6. `Wall` no longer assembles feed rows through browser-side Supabase fan-out; it consumes backend-shaped feed endpoints for both public lanes and `For You`.
7. Feed lane contract is now explicit and canonical in `docs/app/mvp-feed-and-channel-model.md`: `For You` is the only locked lane, `Joined` is joined-channel published discovery, and `All` is the global published blueprint stream.
8. Oracle runtime now treats `RUN_INGESTION_WORKER=true` as the keep-alive background-work switch even in combined mode, so queue polling and YouTube refresh scheduling no longer depend on a separate worker service for MVP production.
9. Backend env bootstrap now loads repo-root `.env` only for non-systemd local runs; Oracle production uses `/etc/agentic-backend.env` as the canonical app-config source and backend startup no longer reads `.env.production`.
10. Subscription feed refresh now treats noisy YouTube RSS fetches as a fetch-layer resilience problem instead of a scheduler failure: transient `5xx/network` feed errors retry inside one sync, stale `404` channel ids can self-heal from the stored channel URL, repeated `404` misses now back off progressively (`1x` -> `2x` -> `4x` -> `8x`, capped at `24h`) instead of returning forever on the base quiet interval, and Oracle-cron `all_active_subscriptions` runs no longer fail the whole batch unless hard failures remain or every attempted creator soft-fails.
11. Queued manual YT2BP work now preserves interactive request class end-to-end: search/manual/source-page generation can use tighter interactive transcript/LLM retry caps plus additive per-stage timing logs (`duration policy`, `transcript fetch`, `LLM generate`, `quality`, `safety`, `review`, `banner`, `total`) without changing the public API envelope.
