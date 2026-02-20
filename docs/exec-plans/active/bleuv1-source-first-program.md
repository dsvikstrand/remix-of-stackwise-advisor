# bleuV1 Source-First Program

Status: `active`

## 1) Problem Statement
Current product value is real but split across two identities:
- community-style blueprint posting
- source-to-blueprint utility

`bleuV1` resolves this by making source-ingested blueprints the primary supply while preserving community opinions through insights, comments, and voting.

## 2) Program Goal
Ship a coherent MVP that users can explain in one sentence:
- bite-sized blueprints from favorite media sources
- enriched by community insights

## 3) Direction Lock
1. Source-first content supply (YouTube adapter first).
2. Personal-first `My Feed` as unfiltered lane.
3. Home feed (`/wall`) is the shared, auto-published lane with classifier-driven checks.
4. User contribution is remix/insight on imported blueprints (not standalone free-form posting in MVP).

## 4) Scope
### In scope
- YouTube-only adapter MVP
- personal feed ingestion lifecycle
- channel candidate gate policy
- provenance and dedupe model
- community interactions (likes/comments/votes/insights)

### Out of scope
- multi-adapter expansion in same MVP cut
- open user-created channels
- full moderation suite

## 5) Core Lifecycle Contract
`source_item -> imported_blueprint -> my_feed -> auto_channel_evaluation -> channel_published|channel_rejected`

Rules:
- `My Feed` is allowed to be broader/noisier.
- Channel feeds must pass channel-fit + quality + safety + PII checks.
- Gate failures stay personal-only.
- Auto-channel assignment is mode-driven in MVP: deterministic tag+alias by default, with optional post-artifact `llm_labeler_v1` and safe fallback to `general`.

## 6) Execution Defaults (Lock)
1. Channel promotion default mode: deterministic auto-publish after checks.
2. Non-pass outcomes: block from channel, keep in My Feed.
3. Stop-and-inspect checkpoints: maximum 3 per milestone.
4. Orchestration control plane default: CLI-first (`codex exec`) + GitHub Actions, with VS Code for authoring/review.

## 7) Program Metrics (Initial)
- ingest success rate
- blueprint generation success rate
- cache hit rate for duplicate source pulls
- channel gate pass rate
- channel reject rate by reason
- comments/votes per channel-published blueprint
- D7 return rate for users with >=1 followed source

## 8) Phase Plan
1. Foundation (`active`): contract lock + docs/IA reset + lifecycle wiring plan.
2. MVP Build: My Feed + source follow mode + channel candidate gate.
3. MVP Validation: quality/cost/relevance tuning and GO/HOLD/PIVOT review.

## 9) Risks and Mitigations
1. Risk: noisy channel feeds from weak fit routing.
   - Mitigation: hard gate channel-fit before publish.
2. Risk: identity drift back to generic posting app.
   - Mitigation: keep standalone posting out of MVP core IA.
3. Risk: ingest cost spikes from duplicate pulls.
   - Mitigation: canonical source keys + cached artifacts.

## 10) Decision Log
- D-001: Codename for direction is `bleuV1`.
- D-002: MVP adapter scope starts with YouTube only.
- D-003: Channel publish uses auto pipeline in MVP with env-selectable classifier (`deterministic_v1` default, `llm_labeler_v1` rollout option, `general_placeholder` rollback).
- D-004: User value-add in MVP is insight/remix on imported blueprints.

## 11) Implementation Snapshot (2026-02-17)
- Personal lane is now first-class:
  - `/my-feed` route exists and is gated by auth.
  - YouTube pulls land in `My Feed` first (`my_feed_published`), not directly in public channels.
- Shared lane is now automatic after My Feed write:
  - Auto publish path exists via `POST /api/my-feed/items/:id/auto-publish`.
  - Legacy candidate endpoints remain for rollback behind env flag.
- Gate flow is wired with all-gates-run aggregation:
  - auto path enforces deterministic checks via `AUTO_CHANNEL_GATE_MODE` (recommended `enforce`)
  - non-pass outcomes route directly to `channel_rejected` in My Feed state.
- Gate runtime state:
  - legacy manual path default remains bypass (`CHANNEL_GATES_MODE=bypass`) for rollback safety.
  - auto path is independently configurable.
- Data foundation is additive and adapter-ready:
  - new tables: `source_items`, `user_source_subscriptions`, `user_feed_items`, `channel_candidates`, `channel_gate_decisions`.
  - adapter abstraction introduced (`BaseAdapter`, `YouTubeAdapter`, registry), with YouTube as MVP implementation.
  - subscription hardening extension: `ingestion_jobs` + subscription sync metadata fields.
- Subscription and ingestion lifecycle (2026-02-18):
  - `POST|GET|PATCH|DELETE /api/source-subscriptions` live for user-managed channel follows.
  - `POST /api/source-subscriptions/:id/sync` live for user-initiated sync.
  - `GET /api/ingestion/jobs/:id` live for owner-scoped background refresh status.
  - `POST /api/ingestion/jobs/trigger` live for Oracle cron/service trigger.
  - debug simulation endpoint available behind env gate: `POST /api/debug/subscriptions/:id/simulate-new-uploads`.
  - pending-card My Feed actions live: `POST /api/my-feed/items/:id/accept|skip`.
  - MVP UX is auto-only; create/reactivate sets checkpoint and skips initial old-video prefill.
  - successful create/reactivate inserts one persistent `subscription_notice` feed card per user/channel.
  - future uploads after checkpoint ingest directly into `my_feed_published`.
  - refresh hardening:
    - scan/generate endpoints enforce per-user cooldown limits.
    - manual refresh enforces max 20 selected videos per run.
    - manual refresh rejects overlapping active jobs (`JOB_ALREADY_RUNNING`).
    - failed manual-refresh videos enter a 6-hour cooldown (`refresh_video_attempts`) before reappearing in scans.
    - successful manual refresh generation advances per-subscription checkpoint forward.
    - user can restore active refresh status after reload via `GET /api/ingestion/jobs/latest-mine`.
    - stale `running` ingestion jobs are auto-recovered (`STALE_RUNNING_RECOVERY`) before new trigger runs.
  - UI hides legacy no-blueprint pending/skipped feed rows to keep My Feed migration-safe.
  - auto-ingestion now runs with AI review enabled and banner generation disabled by default.
- Subscriptions surface foundation (2026-02-17):
  - `/subscriptions` route is live behind the same auth + feature gate as `/my-feed`.
  - page supports channel search + subscribe, plus active-list `Unsubscribe` for MVP simplicity.
  - My Feed now exposes a compact `Manage subscriptions` link (large subscription modal removed).
  - row-level action now simplified to `Unsubscribe`; sync/reactivate UI is deferred.
  - debug simulation remains operator-only and hidden from UI.
- Ingestion trust hardening (2026-02-17):
  - `/subscriptions` keeps per-row health states (`Healthy`, `Delayed`, `Error`, `Waiting`) for operator clarity.
  - aggregate "Ingestion health" summary box is removed from the end-user MVP surface to reduce confusion.
  - delayed polling warning appears when delay ratio is elevated.
  - service-auth latest-job endpoint added: `GET /api/ingestion/jobs/latest`.
- Search discovery surface (2026-02-17):
  - auth-only `/search` route added with nav visibility for signed-in users.
  - backend endpoint `GET /api/youtube-search` added for relevance-ordered YouTube query results.
  - search results are transient and not persisted to My Feed until explicit `Generate Blueprint`.
  - each result card supports `Generate Blueprint`, `Subscribe Channel`, and `Open on YouTube`.
  - `Generate Blueprint` from search opens `/youtube` with prefilled URL and default review/banner enabled so users see staged generation progress.
  - environment requirement added: `YOUTUBE_DATA_API_KEY`.
- Channel discovery for subscriptions (2026-02-17):
  - backend endpoint `GET /api/youtube-channel-search` added for relevance-ordered channel results.
  - `/subscriptions` now supports search-first channel discovery with one-click `Subscribe`.
  - `Add Subscription` popup is the only in-UI subscribe entrypoint (manual fallback input removed).
- My Feed publishing UX refresh (2026-02-18):
  - blueprint items now render in a channel-feed-like card style for visual consistency.
  - posting controls are hidden in auto-channel mode and replaced by read-only footer status labels.
  - top-right post button removed; top-right now shows relative time only.
  - removed nested inner-card shell so blueprint rows render as a single visual card surface.
  - blueprint rows now open detail on card click (explicit `Open blueprint` link removed).
  - My Feed header now includes both `Add Subscription` and `Manage subscriptions` actions.
  - footer status text now shows `Posted to <Channel>` once channel-published; held items remain labeled `In My Feed`.
  - Search->YouTube generate handoff now passes channel context so My Feed subtitle row shows channel name (instead of title duplication).
  - source subtitle mapping now includes metadata fallback (`source_channel_title` from metadata) when base source row column is missing.
- Attribution + subscriptions polish (2026-02-18):
  - blueprint detail header now prefers source-channel attribution for imported YouTube blueprints.
  - default MVP detail view no longer exposes edit CTA.
  - subscription detail popup and active rows are simplified for lower cognitive load.
- Home naming + nav de-emphasis (2026-02-18):
  - signed-in top navigation now uses `Home / Search / Channels / Explore`.
  - `My Feed` is moved out of top nav.
  - shared-lane copy now consistently references `Home` while route stays `/wall`.
- Core terminology harmonization (2026-02-18):
  - high-traffic UI copy now consistently reflects current runtime (`Home`, header `Create`, auto-channel publish) and removes stale manual-post phrasing.
- Landing cold-user optimization (2026-02-19):
  - `/` hero copy now leads with user outcome, not pipeline internals.
  - logged-out primary CTA is `Try YouTube URL`; sign-in is secondary.
  - added above-the-fold proof card and concise use-case strip.
  - `Top Blueprints` and `Trending Topics` now use curated fallback content when live data is empty.
  - frontend runtime guard now shows configuration guidance (instead of blank page) when required Supabase env is missing.
- Profile workspace tabs (2026-02-18):
  - profile now anchors personal workspace with tabs `Feed / Comments / Liked`.
  - profile `Feed` reuses My Feed timeline visuals.
  - non-owner viewers can view public profile feed content but owner-only mutate actions are hidden.
- Subscription notice UX refresh (2026-02-18):
  - notice cards now render channel avatar and optional profile-banner background metadata when available.
  - notice cards show relative time in top-right and `Subscription` badge in status row.
  - notice cards open a details popup that exposes confirm-gated `Unsubscribe`.
  - notice background spans the full card.
  - `DELETE /api/source-subscriptions/:id` now cleans up user `subscription_notice` feed rows for that channel.
- Async auto-banner hardening (2026-02-18):
  - auto-ingest banner mode contract added: `SUBSCRIPTION_AUTO_BANNER_MODE=off|async|sync` (production target: `async`).
  - queue table added: `auto_banner_jobs` with retry/dead-letter lifecycle.
  - policy columns added on `blueprints`: `banner_generated_url`, `banner_effective_source`, `banner_is_locked`, `banner_policy_updated_at`.
  - fallback defaults table added: `channel_default_banners`.
  - service endpoints added:
    - `POST /api/auto-banner/jobs/trigger`
    - `GET /api/auto-banner/jobs/latest`
  - global cap rebalance keeps newest generated banners and demotes older generated banners to deterministic channel defaults (or none if unavailable).
- Auto-channel classifier hardening (2026-02-18):
  - deterministic classifier service now maps tags/aliases to real curated channel slugs.
  - fallback remains `general` for ambiguous/no-match cases.
  - channel-fit gate now uses the same deterministic mapper to keep fit checks aligned with routing decisions.
  - Wall channel label now prefers latest published candidate channel; tag mapper is fallback only.
- LLM labeler rollout prep (2026-02-18):
  - added `llm_labeler_v1` mode for post-artifact sync channel labeling with allowed-slug whitelist.
  - valid label output is trusted; invalid output retries once and then falls back to `general`.
  - auto-publish metadata now includes optional `classifier_confidence` for diagnostics.
- YouTube OAuth bulk import (2026-02-19):
  - `/subscriptions` now includes `Connect YouTube` and `Import from YouTube` flow.
  - backend adds OAuth start/callback/status/disconnect and import preview/import endpoints.
  - import is idempotent, defaults to none-selected, and reactivates inactive rows.
  - disconnect revokes+unlinks OAuth tokens while preserving existing app subscriptions.
- New-account onboarding entry (2026-02-19):
  - optional first-login redirect for new accounts routes to `/welcome`.
  - onboarding completion requires successful import (`imported` or `reactivated` > 0).
  - skip remains non-blocking and Home can show a dismissible setup reminder until completion.
  - existing pre-rollout users are not auto-prompted.
- Source page feed activation (2026-02-19):
  - new endpoint `GET /api/source-pages/:platform/:externalId/blueprints` serves public source-page feed items.
  - feed includes public, channel-published blueprints only; deduped by source video (`source_item_id`).
  - `/s/:platform/:externalId` now renders Home-style read-only blueprint cards with latest-first `Load more` pagination.
- Source page Video Library activation (2026-02-19):
  - added auth-only source backlog listing endpoint `GET /api/source-pages/:platform/:externalId/videos`.
  - added async selected-generation endpoint `POST /api/source-pages/:platform/:externalId/videos/generate`.
  - `/s/:platform/:externalId` now lets signed-in users select older creator videos and queue generation with duplicate skip visibility and job polling.
- Shared unlock + refill-credit cutover (2026-02-20):
  - source-page generation now runs through shared unlock endpoint `POST /api/source-pages/:platform/:externalId/videos/unlock` (legacy `/videos/generate` remains alias).
  - new tables `source_item_unlocks`, `user_credit_wallets`, and `credit_ledger` enforce one-generation-per-source-item with hold -> settle/refund credit accounting.
  - subscription auto-ingest now creates `my_feed_unlockable` rows for new uploads instead of immediate blueprint generation.
  - unlock success fans out the shared blueprint to subscribed users and preserves auto-channel publish for the unlocking user path.
  - unlock request guard is now soft-limited (`8/10s` burst, `120/10m` sustained) with credits as the primary user-facing throttle; frontend credit meter refreshes on unlock settle.
- Home scope split (2026-02-20):
  - `/wall` now separates `For You` (subscribed-source stream, latest-only, locked + unlocked) from `Your channels` (previous followed-channel `For You` behavior).
  - `For You` includes inline unlock entrypoint and transitions unlocked items into channel-style blueprint cards with like/comment parity.
- Explore source search (2026-02-20):
  - Explore adds a dedicated `Sources` filter and includes a `Sources` section in `All` results.
  - backend adds additive public endpoint `GET /api/source-pages/search` (app source-pages only, no schema changes).
  - source cards are minimal and link directly to `/s/:platform/:externalId`.
- Unlock trust pass (2026-02-20):
  - shared frontend unlock tracker now drives status cards on Home `For You`, Source Page `Video Library`, and `My Feed`.
  - unlock progress resumes after reload via latest-mine lookup for `source_item_unlock_generation`.
  - user-menu credits now show refill timing plus latest ledger action summary for hold/settle/refund visibility.
  - Home now includes a first-time dismissible helper clarifying `For You` vs `Your channels`.
- Backend scale hardening (2026-02-20):
  - unlock/manual/service generation now runs enqueue-only with durable DB lease claim + heartbeat worker semantics.
  - `ingestion_jobs` now carries retry/lease metadata (`attempts`, `max_attempts`, `next_run_at`, `lease_expires_at`, `worker_id`, `trace_id`, `payload`).
  - queue backpressure (`QUEUE_BACKPRESSURE`) and intake pause (`QUEUE_INTAKE_DISABLED`) are enforced, and service ops now expose `/api/ops/queue/health`.
- Subscription auto-unlock v1 (2026-02-20):
  - `user_source_subscriptions` now includes `auto_unlock_enabled` (default `true`) for existing and new subscriptions.
  - new subscription uploads prioritize the current subscriber, then sample up to 3 eligible subscribers (`is_active=true`, `auto_unlock_enabled=true`) and stop on first successful reserve+enqueue.
  - if no sampled subscriber can reserve credits, bounded `source_auto_unlock_retry` jobs re-attempt before item remains locked (`my_feed_unlockable`) for manual unlock.

## 12) Next Milestone
1. Validate Oracle cron reliability and alerting around ingestion failures.
2. Decide on `/subscriptions` discoverability upgrade (nav item timing) after URL-only validation period.
3. Design future “sync specific videos” flow before exposing sync controls in UI.
4. Seed per-channel default banners before enabling async mode in production.
5. Add richer ingestion observability dashboards from `ingestion_jobs` + `mvp_events`.
6. Keep legacy manual gate behavior in `bypass` until dedicated enforcement cycle approval.
7. Add pagination and quota guardrails iteration for `/api/youtube-search` based on production usage.
8. Add optional user-facing toggle to include cooldown-suppressed refresh failures in scan results (post-MVP).
