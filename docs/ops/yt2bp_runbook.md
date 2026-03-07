# YT2BP Runbook

## Doc Role
- Supporting operational runbook only; not a primary MVP planning surface.
- Launch gate status lives in `docs/ops/mvp-launch-readiness-checklist.md`.
- Active proof-only tail lives in `docs/exec-plans/active/mvp-launch-proof-tail.md`; completed implementation sequencing lives in `docs/exec-plans/completed/mvp-readiness-review-followup.md`.
- Post-launch debt lives in `docs/exec-plans/tech-debt-tracker.md`.

## Purpose and ownership
- Service: YouTube to Blueprint (`/api/youtube-to-blueprint`)
- Runtime host: Oracle (`oracle-free`)
- Service unit: `agentic-backend.service`
- Primary owner: app backend maintainers
- Launch gate source of truth: `docs/ops/mvp-launch-readiness-checklist.md` (P0/P1 owner/date/status/evidence board).
- Runtime import note:
  - backend OpenAI SDK usage is lazy-loaded at call time; avoid reintroducing top-level `import OpenAI from "openai"` in backend startup files because Oracle `tsx` can stall before the HTTP listener binds.

## bleuV1 source-first integration context
- YT2BP remains the ingestion/generation entrypoint only.
- Home/feed contract now follows the canonical model in `docs/app/mvp-feed-and-channel-model.md`:
  - `For You` is the only source-driven lane and the only lane that may contain locked items.
  - `Joined` is auth-only and shows only published blueprints from Bleu channels the viewer has joined.
  - `All` is the global published-blueprint lane across all Bleu channels.
- Personal-first routing is now expected:
  - generated draft is saved to `My Feed` (`user_feed_items.state = my_feed_published` for direct/manual paths, `my_feed_unlockable` for new subscription uploads).
  - channel visibility is handled by auto-channel pipeline when enabled.
  - `/youtube` runs core generation first and executes optional AI review asynchronously after core success.
  - `Save to My Feed` is non-blocking while optional review completes and attaches later.
  - YouTube-source banners are thumbnail-first (`source_items.thumbnail_url` or deterministic `ytimg` fallback).
  - banner prompts are visual-only by policy (no readable text/typography/logos/watermarks).
- Gate runtime mode:
  - legacy manual candidate flow uses `CHANNEL_GATES_MODE` (`bypass|shadow|enforce`).
  - auto-channel flow uses `AUTO_CHANNEL_GATE_MODE` (`enforce` default recommendation).
- Legacy candidate lifecycle endpoints (same backend service, rollback path):
  - `POST /api/channel-candidates`
  - `GET /api/channel-candidates/:id`
  - `POST /api/channel-candidates/:id/evaluate`
  - `POST /api/channel-candidates/:id/publish`
  - `POST /api/channel-candidates/:id/reject`
- Auto-channel endpoint:
  - `POST /api/my-feed/items/:id/auto-publish`
- Source-page endpoints:
  - `GET /api/source-pages/:platform/:externalId` (public read)
  - `GET /api/source-pages/:platform/:externalId/blueprints` (public source-page feed, deduped by source video, cursor-paginated, includes additive `source_thumbnail_url`)
  - `GET /api/source-pages/:platform/:externalId/videos` (auth source-page video-library list, supports `kind=full|shorts`)
    - rate policy: burst `4/15s` + sustained `40/10m` per user/IP.
  - `POST /api/source-pages/:platform/:externalId/videos/unlock` (auth shared unlock + async generation queue for selected source videos)
    - rate policy: burst `8/10s` + sustained `120/10m` per user/IP.
    - additive response field: `data.trace_id` for unlock tracing.
  - `POST /api/source-pages/:platform/:externalId/videos/generate` (compatibility alias to `/videos/unlock`)
    - mirrors unlock response contract, including `data.trace_id`.
  - `POST /api/source-pages/:platform/:externalId/subscribe` (auth)
  - `DELETE /api/source-pages/:platform/:externalId/subscribe` (auth)
  - Frontend trust status now resumes unlock jobs via `GET /api/ingestion/jobs/latest-mine?scope=source_item_unlock_generation` after reload.
  - Legacy generation compatibility endpoints (auth):
    - `GET /api/generation/tier-access`
    - `GET /api/blueprints/:id/variants`
  - Notification inbox endpoints (auth):
    - `GET /api/notifications`
    - `POST /api/notifications/:id/read`
    - `POST /api/notifications/read-all`
    - emitted event families: `comment_reply`, `generation_succeeded`, `generation_failed`.
- Profile feed read endpoint:
  - `GET /api/profile/:userId/feed` (optional auth; public profiles readable, private profiles owner-only)
- Subscription auto-unlock policy:
  - `user_source_subscriptions.auto_unlock_enabled` defaults to `true` for existing and new rows.
  - runtime policy is funded-subscriber shared-cost auto generation: one `1.00` credit event per source video, split across the funded auto-enabled subscriber snapshot for that release.
  - funded subset selection uses deterministic fixed-point recomputation at reservation time; remainder cents go to the lowest stable user ids.
  - admin entitlement users participate as bypass-funded users and should not be excluded solely due to wallet balance.
  - if eligible users fail credit reserve, backend enqueues bounded `source_auto_unlock_retry` jobs so unlock can complete after credit refill.
  - if no eligible/funded users can reserve credits, item remains `my_feed_unlockable` for manual unlock.

## Health checks
- Local service health:
```bash
ssh oracle-free 'curl -sS http://localhost:8787/api/health'
```
- Public health:
```bash
curl -sS https://bapi.vdsai.cloud/api/health
```
- Latest ingestion job (service auth):
```bash
curl -sS https://bapi.vdsai.cloud/api/ingestion/jobs/latest \
  -H "x-service-token: $INGESTION_SERVICE_TOKEN"
```
- Queue health snapshot (service auth):
```bash
curl -sS https://bapi.vdsai.cloud/api/ops/queue/health \
  -H "x-service-token: $INGESTION_SERVICE_TOKEN"
```
- Queue-health fields to inspect first:
  - `queue_depth` / `running_depth`
  - `queue_work_items` / `running_work_items`
  - per-scope `queued` vs `queued_work_items`
  - per-scope `running` vs `running_work_items`

### YouTube metadata refresh scheduler (worker-only)
- Purpose: periodically refresh stored `view_count` and YouTube comment snapshots without calling YouTube from page loads.
- Queue scope: `blueprint_youtube_refresh` (low-priority, budgeted).
- Default cadence: every `10` minutes.
- Comments policy:
  - auto refresh once at `+15m` after blueprint registration
  - auto refresh once at `+24h` after blueprint registration
  - then manual refresh only (`POST /api/blueprints/:id/youtube-comments/refresh`) with per-blueprint `24h` cooldown
- Default per-cycle budget:
  - view refresh jobs: `15`
  - comments refresh jobs: `5`
  - total: `20`
- Queue safety guard: if queue depth is `>= 100`, scheduler skips enqueueing for that cycle.
- Disable quickly:
```bash
# in /etc/agentic-backend.env
YOUTUBE_REFRESH_ENABLED=false
```
- If the migration for `blueprint_youtube_refresh_state` has not been applied yet, scheduler operations no-op safely.
- Source-page search stability note:
  - `/api/source-pages/search` may run opportunistic source-page asset sweep.
  - if this route ever causes process restarts, verify route dependency wiring for `runSourcePageAssetSweep` in source-page route registration.
- Latest auto-banner queue snapshot (service auth):
```bash
curl -sS https://bapi.vdsai.cloud/api/auto-banner/jobs/latest \
  -H "x-service-token: $INGESTION_SERVICE_TOKEN"
```
- Public YT2BP endpoint basic probe:
```bash
curl -sS -X POST https://bapi.vdsai.cloud/api/youtube-to-blueprint \
  -H 'Content-Type: application/json' \
  --data '{"video_url":"https://www.youtube.com/watch?v=16hFQZbxZpU","generate_review":false,"generate_banner":false,"source":"youtube_mvp"}'
```

### Experimental Codex rollout (safe sequence)
1. Deploy code with `USE_CODEX_FOR_GENERATION=false`.
2. Set Codex envs (`CODEX_*`) on Oracle and restart service.
3. Verify Codex is reachable on host:
```bash
ssh oracle-free 'codex --version'
```
4. Enable `USE_CODEX_FOR_GENERATION=true`, restart service, then run YT2BP smoke.
5. Watch logs for:
   - `codex_generation_attempt` (`codex_success` vs `codex_fallback_openai`)
   - `codex_generation_circuit_open`
6. Roll back instantly by setting `USE_CODEX_FOR_GENERATION=false` and restarting.

- Notification inbox probe (auth):
```bash
curl -sS "https://bapi.vdsai.cloud/api/notifications?limit=5" \
  -H "Authorization: Bearer $USER_TOKEN"
```

## Service lifecycle
- Status:
```bash
ssh oracle-free 'sudo systemctl status --no-pager agentic-backend.service'
```
- Restart:
```bash
ssh oracle-free 'sudo systemctl restart agentic-backend.service'
```
- Tail logs:
```bash
ssh oracle-free 'sudo journalctl -u agentic-backend.service -n 200 --no-pager'
```
- Canonical runtime config:
```bash
ssh oracle-free 'sudo ls -l /etc/agentic-backend.env'
```
- Runtime source-of-truth rule:
  - live backend app config comes from `/etc/agentic-backend.env`
  - repo-root `.env` / `.env.production` are local/dev-only and must not be used for Oracle production boot
  - the only expected remaining backend systemd drop-in is the Node path helper

## Release contract (backend first)
- Release rule:
  - push code to `main`
  - capture one explicit `release_sha`
  - deploy Oracle backend to that SHA first
  - run backend smoke checks
  - publish the frontend for that same `release_sha`
  - verify parity with backend `HEAD` and frontend `/release.json`
- Capture the release SHA locally:
```bash
export RELEASE_SHA="$(git rev-parse HEAD)"
```
- Backend deploy to the expected SHA:
```bash
ssh oracle-free "cd /home/ubuntu/remix-of-stackwise-advisor && git fetch origin main && git checkout main && git pull --ff-only origin main && test \"\$(git rev-parse HEAD)\" = \"$RELEASE_SHA\" && sudo systemctl restart agentic-backend.service"
```
- Backend smoke on Oracle:
```bash
ssh oracle-free 'export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 20.20.0 >/dev/null; set -a; . /etc/agentic-backend.env; set +a; cd /home/ubuntu/remix-of-stackwise-advisor && npm run smoke:release -- --api-base-url http://127.0.0.1:8787 --service-token "$INGESTION_SERVICE_TOKEN"'
```
- Frontend publish:
  - GitHub -> `Actions` -> `Deploy Frontend Release`
  - choose branch `main`
  - set `release_sha=$RELEASE_SHA`
  - run the workflow manually
- Public parity check after the frontend publish finishes:
```bash
npm run smoke:release -- --api-base-url https://api.bleup.app --frontend-base-url https://dsvikstrand.github.io/remix-of-stackwise-advisor --release-sha "$RELEASE_SHA"
```
- Frontend parity proof endpoint:
```bash
curl -sS https://dsvikstrand.github.io/remix-of-stackwise-advisor/release.json
```

## Environment checklist
Required runtime variables:
- `OPENAI_API_KEY`
- `YOUTUBE_DATA_API_KEY` (required for `/api/youtube-search`)
- `GOOGLE_OAUTH_CLIENT_ID` (required for `/api/youtube/connection*`)
- `GOOGLE_OAUTH_CLIENT_SECRET` (required for `/api/youtube/connection*`)
- `YOUTUBE_OAUTH_REDIRECT_URI` (must match Google OAuth client redirect URI exactly)
- `YOUTUBE_OAUTH_SCOPES` (default `https://www.googleapis.com/auth/youtube.readonly`)
- `TOKEN_ENCRYPTION_KEY` (base64 32-byte key for encrypted OAuth tokens at rest)
- `YOUTUBE_IMPORT_MAX_CHANNELS` (default `2000`)
- `YOUTUBE_OAUTH_STATE_TTL_SECONDS` (default `600`)
- `TRANSCRIPT_PROVIDER` (`yt_to_text` or `youtube_timedtext`)
- `YT2BP_ENABLED`
- `YT2BP_QUALITY_ENABLED`
- `YT2BP_CONTENT_SAFETY_ENABLED`
- `YT2BP_ANON_LIMIT_PER_MIN`
- `YT2BP_AUTH_LIMIT_PER_MIN`
- `YT2BP_IP_LIMIT_PER_HOUR`
- `YT2BP_CORE_TIMEOUT_MS` (default `120000`)
- `YT2BP_TRANSCRIPT_PRUNE_ENABLED` (default `true`)
- `YT2BP_TRANSCRIPT_PRUNE_BUDGET_CHARS` (default `4500`)
- `YT2BP_TRANSCRIPT_PRUNE_THRESHOLDS` (default `4500,9000,16000`)
- `YT2BP_TRANSCRIPT_PRUNE_WINDOWS` (default `1,4,6,8`)
- `GENERATION_DURATION_CAP_ENABLED` (default `false`; enable max video length guard)
- `GENERATION_MAX_VIDEO_SECONDS` (default `2700`)
- `GENERATION_BLOCK_UNKNOWN_DURATION` (default `true`)
- `GENERATION_DURATION_LOOKUP_TIMEOUT_MS` (default `8000`)
- `CHANNEL_GATES_MODE` (`bypass` | `shadow` | `enforce`)
- `AUTO_CHANNEL_PIPELINE_ENABLED` (`true|false`)
- `AUTO_CHANNEL_DEFAULT_SLUG` (default `general`)
- `AUTO_CHANNEL_CLASSIFIER_MODE` (`deterministic_v1|llm_labeler_v1|general_placeholder`)
- `AUTO_CHANNEL_FALLBACK_SLUG` (default `general`)
- `AUTO_CHANNEL_GATE_MODE` (`bypass|shadow|enforce`)
- `AUTO_CHANNEL_LEGACY_MANUAL_FLOW_ENABLED` (`true` default)
- `SUPABASE_SERVICE_ROLE_KEY` (required for cron ingestion trigger path)
- `INGESTION_SERVICE_TOKEN` (shared secret for `/api/ingestion/jobs/trigger`)
- `ENABLE_DEBUG_ENDPOINTS` (`false` by default; must be `true` to enable debug simulation endpoint)
- `INGESTION_MAX_PER_SUBSCRIPTION` (default `5`)
- `REFRESH_SCAN_COOLDOWN_MS` (default `30000`)
- `REFRESH_GENERATE_COOLDOWN_MS` (default `120000`)
- `REFRESH_GENERATE_MAX_ITEMS` (default `10`)
- `REFRESH_FAILURE_COOLDOWN_HOURS` (default `6`)
- `INGESTION_STALE_RUNNING_MS` (default `1800000`)
- `SUBSCRIPTION_AUTO_BANNER_MODE` (`off|async|sync`, compatibility/non-source paths)
- `SUBSCRIPTION_AUTO_BANNER_CAP` (default `1000`)
- `SUBSCRIPTION_AUTO_BANNER_MAX_ATTEMPTS` (default `3`)
- `SUBSCRIPTION_AUTO_BANNER_TIMEOUT_MS` (default `12000`)
- `SUBSCRIPTION_AUTO_BANNER_BATCH_SIZE` (default `20`)
- `SUBSCRIPTION_AUTO_BANNER_CONCURRENCY` (default `1`)
- `AUTO_BANNER_STALE_RUNNING_MS` (default `1200000`)
- `CREDIT_WALLET_CAPACITY` (default `10`)
- `CREDIT_WALLET_INITIAL_BALANCE` (default `10`)
- `CREDIT_REFILL_SECONDS_PER_CREDIT` (default `360`)
- `SOURCE_UNLOCK_RESERVATION_SECONDS` (default `300`)
- `SOURCE_UNLOCK_GENERATE_MAX_ITEMS` (default `100`)
- `SOURCE_AUTO_UNLOCK_RETRY_DELAY_SECONDS` (default `90`)
- `SOURCE_AUTO_UNLOCK_RETRY_MAX_ATTEMPTS` (default `3`)
- `SOURCE_TRANSCRIPT_RETRY_DELAY_SECONDS` (default `300`)
- `SOURCE_TRANSCRIPT_RETRY_DELAY_ATTEMPT1_SECONDS` (default `300`)
- `SOURCE_TRANSCRIPT_RETRY_DELAY_ATTEMPT2_SECONDS` (default `900`)
- `SOURCE_TRANSCRIPT_RETRY_DELAY_ATTEMPT3_SECONDS` (default `2700`)
- `SOURCE_TRANSCRIPT_MAX_ATTEMPTS` (default `3`)
- `TRANSCRIPT_FAIL_FAST_ENABLED` (default `true`; terminal transcript provider errors do not enter retry loops)
- `SOURCE_UNLOCK_TRANSCRIPT_COOLDOWN_HOURS` (deprecated; explicit retry-after controls cooldown)
- `SOURCE_UNLOCK_EXPIRED_SWEEP_BATCH` (default `100`)
- `SOURCE_UNLOCK_SWEEPS_ENABLED` (default `true`)
- `SOURCE_UNLOCK_SWEEP_BATCH` (default `100`)
- `SOURCE_UNLOCK_PROCESSING_STALE_MS` (default `600000`)
- `SOURCE_UNLOCK_SWEEP_MIN_INTERVAL_MS` (default `30000`)
- `SOURCE_UNLOCK_SWEEP_DRY_LOGS` (default `true`)
- `SOURCE_VIDEO_UNLOCK_BURST_WINDOW_MS` (default `10000`)
- `SOURCE_VIDEO_UNLOCK_BURST_MAX` (default `8`)
- `SOURCE_VIDEO_UNLOCK_SUSTAINED_WINDOW_MS` (default `600000`)
- `SOURCE_VIDEO_UNLOCK_SUSTAINED_MAX` (default `120`)
- `CREDITS_READ_WINDOW_MS` (default `60000`)
- `CREDITS_READ_MAX_PER_WINDOW` (default `180`)
- `CREDIT_WALLET_FREE_DAILY_GRANT` (default `3.00`; daily grant for free users at `00:00 UTC`)
- `CREDIT_WALLET_PLUS_DAILY_GRANT` (default `20.00`; daily grant for plus users at `00:00 UTC`)
- `CREDIT_WALLET_ADMIN_DAILY_GRANT` (default `20.00`; admin grant/bypass baseline)
- `CREDIT_WALLET_INITIAL_BALANCE` (default follows free daily grant for new rows)
- `AI_CREDITS_BYPASS` (default `false`; if true, credit-dependent routes fail open for billing but still return wallet-shaped responses)
- `INGESTION_LATEST_MINE_WINDOW_MS` (default `60000`)
- `INGESTION_LATEST_MINE_MAX_PER_WINDOW` (default `180`)
- `UNLOCK_INTAKE_ENABLED` (default `true`, fast pause for new unlock intake)
- `RUN_HTTP_SERVER` (default `true`; enable HTTP server in the current process)
- `RUN_INGESTION_WORKER` (default `true`; enable queued ingestion worker in the current process)
- `YOUTUBE_REFRESH_ENABLED` (default `true`; enables low-priority YouTube metadata refresh scheduler on worker)
- `YOUTUBE_REFRESH_INTERVAL_MINUTES` (default `10`)
- `YOUTUBE_REFRESH_QUEUE_DEPTH_GUARD` (default `100`; scheduler skips enqueueing when queue depth is high)
- `YOUTUBE_REFRESH_VIEW_MAX_PER_CYCLE` (default `15`)
- `YOUTUBE_REFRESH_COMMENTS_MAX_PER_CYCLE` (default `5`)
- `YOUTUBE_REFRESH_VIEW_INTERVAL_HOURS` (default `12`)
- `YOUTUBE_COMMENTS_AUTO_FIRST_DELAY_MINUTES` (default `15`)
- `YOUTUBE_COMMENTS_AUTO_SECOND_DELAY_HOURS` (default `24`)
- `YOUTUBE_COMMENTS_MANUAL_COOLDOWN_HOURS` (default `24`)
- `YOUTUBE_SEARCH_CACHE_ENABLED` (default `true`; enables cache-first behavior for `/api/youtube-search` and `/api/youtube-channel-search`)
- `YOUTUBE_SEARCH_CACHE_TTL_SECONDS` (default `600`; fresh TTL for video search cache)
- `YOUTUBE_CHANNEL_SEARCH_CACHE_TTL_SECONDS` (default `900`; fresh TTL for channel search cache)
- `YOUTUBE_SEARCH_STALE_MAX_SECONDS` (default `86400`; max stale age served during degrade mode)
- `YOUTUBE_SEARCH_DEGRADE_ENABLED` (default `true`; enables stale-first fallback when global quota is constrained)
- `YOUTUBE_GLOBAL_LIVE_CALLS_PER_MIN` (default `60`; shared live YouTube call budget per minute)
- `YOUTUBE_GLOBAL_LIVE_CALLS_PER_DAY` (default `20000`; shared live YouTube call budget per UTC day)
- `YOUTUBE_GLOBAL_COOLDOWN_SECONDS` (default `600`; cooldown window after provider quota pressure)
- `QUEUE_DEPTH_HARD_LIMIT` (default `1000`)
- `QUEUE_DEPTH_PER_USER_LIMIT` (default `50`)
- `QUEUE_PRIORITY_ENABLED` (default `true`; worker claims high/medium/low scopes in priority order)
- `QUEUE_SWEEP_HIGH_BATCH` (default `10`)
- `QUEUE_SWEEP_MEDIUM_BATCH` (default `5`)
- `QUEUE_SWEEP_LOW_BATCH` (default `2`)
- `QUEUE_LOW_PRIORITY_SUPPRESSION_DEPTH` (default `100`; suppresses enqueue for low-priority scopes when queue depth is elevated)
- `WORKER_CONCURRENCY` (default `2`)
- `WORKER_BATCH_SIZE` (default `10`)
- `WORKER_LEASE_MS` (default `90000`)
- `WORKER_HEARTBEAT_MS` (default `10000`)
- `JOB_EXECUTION_TIMEOUT_MS` (default `180000`)
- `TRANSCRIPT_MAX_ATTEMPTS` (default `2`)
- `TRANSCRIPT_TIMEOUT_MS` (default `25000`)
- `TRANSCRIPT_THROTTLE_ENABLED` (default `false`, transcript single-lane governor)
- `TRANSCRIPT_THROTTLE_TIERS_MS` (default `3000,10000,30000,60000`)
- `TRANSCRIPT_THROTTLE_JITTER_MS` (default `500`)
- `TRANSCRIPT_THROTTLE_INTERACTIVE_MAX_WAIT_MS` (default `2000`)
- `GENERATION_TIER_TEST_MODE_ENABLED` (default `false`)
- `GENERATION_TIER_TIER_USER_IDS` (csv user ids that can request `tier`)
- `GENERATION_TIER_FREE_USER_IDS` (legacy compatibility only; runtime generation no longer branches on free vs tier quality)
- `GENERATION_TIER_FREE_MODEL` (legacy compatibility only; runtime uses the canonical tier profile)
- `GENERATION_TIER_FREE_FALLBACK_MODEL` (legacy compatibility only)
- `GENERATION_TIER_FREE_REASONING_EFFORT` (legacy compatibility only)
- `GENERATION_TIER_TIER_MODEL` (default `gpt-5.2`; canonical generation model profile)
- `GENERATION_TIER_TIER_FALLBACK_MODEL` (default follows `OPENAI_GENERATION_FALLBACK_MODEL`)
- `GENERATION_TIER_TIER_REASONING_EFFORT` (default `low`)
- `YT2BP_TIER_ONE_STEP_ENABLED` (legacy compatibility only; runtime now always uses the one-step pipeline)
- `YT2BP_TIER_ONE_STEP_PROMPT_TEMPLATE_PATH` (default `docs/golden_blueprint/golden_bp_prompt_contract_one_step_v1.md`)
- `GENERATION_TIER_DUAL_GENERATE_ENABLED` (legacy compatibility only; runtime no longer dual-generates)
- `GENERATION_TIER_DUAL_GENERATE_USER_IDS` (legacy compatibility only)
- `GENERATION_TIER_DUAL_GENERATE_SCOPE` (legacy compatibility only)
- `GENERATION_TIER_DUAL_GENERATE_CREDIT_MODE` (legacy compatibility only)
- `USE_CODEX_FOR_GENERATION` (default `false`; experimental Codex-first generation path for YT2BP stages)
- `CODEX_EXEC_PATH` (default `codex`)
- `CODEX_EXEC_TIMEOUT_MS` (default `90000`)
- `CODEX_EXEC_LANE_CONCURRENCY` (forced to `1` in MVP)
- `CODEX_EXEC_REASONING_EFFORT` (default `low`)
- `CODEX_EXEC_REASONING_EFFORT_FREE` (optional; defaults to `CODEX_EXEC_REASONING_EFFORT`)
- `CODEX_EXEC_REASONING_EFFORT_TIER` (optional; defaults to `CODEX_EXEC_REASONING_EFFORT`)
- `CODEX_FREE_MODEL` (default `gpt-5-mini`)
- `CODEX_TIER_MODEL` (default `gpt-5.2`)
- `CODEX_FALLBACK_ENABLED` (default `true`; immediate API fallback on Codex errors)
- `CODEX_CIRCUIT_FAILURE_THRESHOLD` (default `5`)
- `CODEX_CIRCUIT_COOLDOWN_MS` (default `300000`)
- `LLM_MAX_ATTEMPTS` (default `2`)
- `LLM_TIMEOUT_MS` (default `60000`)
- `PROVIDER_CIRCUIT_FAILURE_THRESHOLD` (default `5`)
- `PROVIDER_CIRCUIT_COOLDOWN_SECONDS` (default `60`)
- `PROVIDER_FAIL_FAST_MODE` (default `false`)

Safe defaults:
- `YT2BP_ENABLED=true`
- `YT2BP_QUALITY_ENABLED=true`
- `YT2BP_CONTENT_SAFETY_ENABLED=true`
- `YT2BP_ANON_LIMIT_PER_MIN=6`
- `YT2BP_AUTH_LIMIT_PER_MIN=20`
- `YT2BP_IP_LIMIT_PER_HOUR=30`
- `YT2BP_CORE_TIMEOUT_MS=120000`
- `YT2BP_TRANSCRIPT_PRUNE_ENABLED=true`
- `YT2BP_TRANSCRIPT_PRUNE_BUDGET_CHARS=4500`
- `YT2BP_TRANSCRIPT_PRUNE_THRESHOLDS=4500,9000,16000`
- `YT2BP_TRANSCRIPT_PRUNE_WINDOWS=1,4,6,8`
- `YT2BP_TIER_ONE_STEP_ENABLED=false`
- `YT2BP_TIER_ONE_STEP_PROMPT_TEMPLATE_PATH=docs/golden_blueprint/golden_bp_prompt_contract_one_step_v1.md`
- `GENERATION_DURATION_CAP_ENABLED=false`
- `GENERATION_MAX_VIDEO_SECONDS=2700`
- `GENERATION_BLOCK_UNKNOWN_DURATION=true`
- `GENERATION_DURATION_LOOKUP_TIMEOUT_MS=8000`
- `CHANNEL_GATES_MODE=bypass`
- `AUTO_CHANNEL_PIPELINE_ENABLED=false`
- `AUTO_CHANNEL_DEFAULT_SLUG=general`
- `AUTO_CHANNEL_CLASSIFIER_MODE=deterministic_v1`
- `AUTO_CHANNEL_FALLBACK_SLUG=general`
- `AUTO_CHANNEL_GATE_MODE=enforce`
- `AUTO_CHANNEL_LEGACY_MANUAL_FLOW_ENABLED=true`
- `ENABLE_DEBUG_ENDPOINTS=false`
- `INGESTION_MAX_PER_SUBSCRIPTION=5`
- `REFRESH_SCAN_COOLDOWN_MS=30000`
- `REFRESH_GENERATE_COOLDOWN_MS=120000`
- `REFRESH_GENERATE_MAX_ITEMS=10`
- `REFRESH_FAILURE_COOLDOWN_HOURS=6`
- `INGESTION_STALE_RUNNING_MS=1800000`
- `SUBSCRIPTION_AUTO_BANNER_MODE=off`
- `SUBSCRIPTION_AUTO_BANNER_CAP=1000`
- `SUBSCRIPTION_AUTO_BANNER_MAX_ATTEMPTS=3`
- `SUBSCRIPTION_AUTO_BANNER_TIMEOUT_MS=12000`
- `SUBSCRIPTION_AUTO_BANNER_BATCH_SIZE=20`
- `SUBSCRIPTION_AUTO_BANNER_CONCURRENCY=1`
- `AUTO_BANNER_STALE_RUNNING_MS=1200000`
- `CREDIT_WALLET_CAPACITY=10`
- `CREDIT_WALLET_INITIAL_BALANCE=10`
- `CREDIT_REFILL_SECONDS_PER_CREDIT=360`
- `SOURCE_UNLOCK_RESERVATION_SECONDS=300`
- `SOURCE_UNLOCK_GENERATE_MAX_ITEMS=100`
- `SOURCE_AUTO_UNLOCK_RETRY_DELAY_SECONDS=90`
- `SOURCE_AUTO_UNLOCK_RETRY_MAX_ATTEMPTS=3`
- `SOURCE_TRANSCRIPT_RETRY_DELAY_SECONDS=300`
- `SOURCE_TRANSCRIPT_RETRY_DELAY_ATTEMPT1_SECONDS=300`
- `SOURCE_TRANSCRIPT_RETRY_DELAY_ATTEMPT2_SECONDS=900`
- `SOURCE_TRANSCRIPT_RETRY_DELAY_ATTEMPT3_SECONDS=2700`
- `SOURCE_TRANSCRIPT_MAX_ATTEMPTS=3`
- `TRANSCRIPT_FAIL_FAST_ENABLED=true`
- `SOURCE_UNLOCK_TRANSCRIPT_COOLDOWN_HOURS=6` (deprecated)
- `SOURCE_UNLOCK_EXPIRED_SWEEP_BATCH=100`
- `SOURCE_UNLOCK_SWEEPS_ENABLED=true`
- `SOURCE_UNLOCK_SWEEP_BATCH=100`
- `SOURCE_UNLOCK_PROCESSING_STALE_MS=600000`
- `SOURCE_UNLOCK_SWEEP_MIN_INTERVAL_MS=30000`
- `SOURCE_UNLOCK_SWEEP_DRY_LOGS=true`
- `SOURCE_VIDEO_UNLOCK_BURST_WINDOW_MS=10000`
- `SOURCE_VIDEO_UNLOCK_BURST_MAX=8`
- `SOURCE_VIDEO_UNLOCK_SUSTAINED_WINDOW_MS=600000`
- `SOURCE_VIDEO_UNLOCK_SUSTAINED_MAX=120`
- `CREDITS_READ_WINDOW_MS=60000`
- `CREDITS_READ_MAX_PER_WINDOW=180`
- `INGESTION_LATEST_MINE_WINDOW_MS=60000`
- `INGESTION_LATEST_MINE_MAX_PER_WINDOW=180`
- `UNLOCK_INTAKE_ENABLED=true`
- `RUN_HTTP_SERVER=true`
- `RUN_INGESTION_WORKER=true`
- `QUEUE_DEPTH_HARD_LIMIT=1000`
- `QUEUE_DEPTH_PER_USER_LIMIT=50`
- `QUEUE_PRIORITY_ENABLED=true`
- `QUEUE_SWEEP_HIGH_BATCH=10`
- `QUEUE_SWEEP_MEDIUM_BATCH=5`
- `QUEUE_SWEEP_LOW_BATCH=2`
- `QUEUE_LOW_PRIORITY_SUPPRESSION_DEPTH=100`
- `WORKER_CONCURRENCY=2`
- `WORKER_BATCH_SIZE=10`
- `WORKER_LEASE_MS=90000`
- `WORKER_HEARTBEAT_MS=10000`
- `JOB_EXECUTION_TIMEOUT_MS=180000`
- `TRANSCRIPT_MAX_ATTEMPTS=2`
- `TRANSCRIPT_TIMEOUT_MS=25000`
- `TRANSCRIPT_THROTTLE_ENABLED=false`
- `TRANSCRIPT_THROTTLE_TIERS_MS=3000,10000,30000,60000`
- `TRANSCRIPT_THROTTLE_JITTER_MS=500`
- `TRANSCRIPT_THROTTLE_INTERACTIVE_MAX_WAIT_MS=2000`
- `LLM_MAX_ATTEMPTS=2`
- `LLM_TIMEOUT_MS=60000`
- `PROVIDER_CIRCUIT_FAILURE_THRESHOLD=5`
- `PROVIDER_CIRCUIT_COOLDOWN_SECONDS=60`
- `PROVIDER_FAIL_FAST_MODE=false`

## Transcript throttle rollout checks
- Deploy phase 1:
  - keep `TRANSCRIPT_THROTTLE_ENABLED=false`.
  - deploy/restart and confirm no behavior change.
- Deploy phase 2:
  - set `TRANSCRIPT_THROTTLE_ENABLED=true` with default tiers and wait cap.
  - restart service and monitor for 24h.
- Verify:
  - concurrent `/api/youtube-to-blueprint` calls should serialize at transcript stage.
  - overloaded interactive calls should return `429 RATE_LIMITED` with `retry_after_seconds`.
  - queued generation should continue progressing (background waits, no fast-fail).
- Fast rollback:
  - set `TRANSCRIPT_THROTTLE_ENABLED=false`.
  - restart `agentic-backend.service`.

## Onboarding rollout checks
- Schema check:
  - `public.user_youtube_onboarding` exists.
  - trigger `on_auth_user_created_youtube_onboarding` exists on `auth.users`.
- Behavior check (new account only):
  1. create a fresh account and sign in.
  2. verify first authenticated navigation is redirected to `/welcome`.
  3. click `Skip for now` and verify redirect to `/wall`.

## Web / worker split rollout
- Combined mode remains the default:
  - `RUN_HTTP_SERVER=true`
  - `RUN_INGESTION_WORKER=true`
- Current MVP production recommendation:
  - `agentic-backend.service` runs in combined mode:
    - `RUN_HTTP_SERVER=true`
    - `RUN_INGESTION_WORKER=true`
    - values live in `/etc/agentic-backend.env`
  - `agentic-worker.service` stays disabled unless an explicit later scale pass re-enables the split-runtime topology

### Optional later split
- Deferred until needed beyond the MVP target:
  - `agentic-backend.service` (web):
    - `RUN_HTTP_SERVER=true`
    - `RUN_INGESTION_WORKER=false`
  - `agentic-worker.service` (worker):
    - `RUN_HTTP_SERVER=false`
    - `RUN_INGESTION_WORKER=true`

### Create worker service
1. Copy the existing backend unit as a starting point:
```bash
ssh oracle-free 'sudo cp /etc/systemd/system/agentic-backend.service /etc/systemd/system/agentic-worker.service'
```
2. Edit `agentic-worker.service`:
  - keep the same `WorkingDirectory`, `EnvironmentFile`, and start command
  - add:
    - `Environment=RUN_HTTP_SERVER=false`
    - `Environment=RUN_INGESTION_WORKER=true`
3. Edit `agentic-backend.service`:
  - add:
    - `Environment=RUN_HTTP_SERVER=true`
    - `Environment=RUN_INGESTION_WORKER=false`
4. Reload systemd and start the worker:
```bash
ssh oracle-free 'sudo systemctl daemon-reload && sudo systemctl enable --now agentic-worker.service && sudo systemctl restart agentic-backend.service'
```

### Verification
```bash
ssh oracle-free 'sudo systemctl status agentic-backend.service --no-pager'
ssh oracle-free 'sudo systemctl status agentic-worker.service --no-pager'
ssh oracle-free 'ss -ltnp | grep 8787 || true'
ssh oracle-free 'sudo journalctl -u agentic-worker.service -n 100 --no-pager'
```
- The web service should bind `:8787`.
- The worker service should not bind a port.
- The worker service should log queue activity.

### Rollback to combined mode
1. Stop the worker:
```bash
ssh oracle-free 'sudo systemctl disable --now agentic-worker.service'
```
2. Remove or override the web unit flags back to combined mode:
  - `RUN_HTTP_SERVER=true`
  - `RUN_INGESTION_WORKER=true`
3. Reload and restart:
```bash
ssh oracle-free 'sudo systemctl daemon-reload && sudo systemctl restart agentic-backend.service'
```
4. Confirm the combined-mode flags are present in `/etc/agentic-backend.env`.
  4. verify Home shows dismissible setup reminder card.
  5. complete import with at least one imported/reactivated channel and verify reminder no longer appears.
- Existing-account check:
  - existing users created before migration should not be auto-redirected to `/welcome`.

## Failure playbooks

### `PROVIDER_FAIL`
- Meaning: transcript provider failed upstream.
- Action:
  1) Confirm provider setting (`TRANSCRIPT_PROVIDER`).
  2) Run toy transcript probe:
  ```bash
  TRANSCRIPT_PROVIDER=yt_to_text node --import tsx scripts/toy_fetch_transcript.ts --url 'https://www.youtube.com/watch?v=16hFQZbxZpU'
  ```
  3) Switch provider if needed.

### `RATE_LIMITED`
- Meaning: anon/auth/hourly limiter tripped.
- Action:
  1) Check request volume in logs.
  2) Check whether rate limit is endpoint limiter or transcript throttle (`retry_after_seconds` present on YT2BP responses).
  3) Temporarily raise limits only if operationally justified.
  4) Keep hourly cap as abuse guard.

### `INSUFFICIENT_CREDITS`
- Meaning: user has exhausted the current daily credit wallet for their plan or cannot afford the requested new work items.
- Action:
  1) Check `/api/credits` fields (`daily_grant`, `balance`, `capacity`, `next_reset_at`, `plan`, plus compatibility `generation_daily_*` fields if needed).
  2) Confirm wallet grant config in `/etc/agentic-backend.env`:
     - `CREDIT_WALLET_FREE_DAILY_GRANT`
     - `CREDIT_WALLET_PLUS_DAILY_GRANT`
     - `CREDIT_WALLET_ADMIN_DAILY_GRANT`
  3) For admin users, confirm entitlement row first; `AI_CREDITS_BYPASS` is only the global fail-open flag and should not be required for normal admin bypass behavior.

### `CREDITS_UNAVAILABLE`
- Meaning: backend credit service path is unavailable (for example missing/invalid service-role path or credit RPC failure).
- Action:
  1) Check `/api/credits` directly; confirm payload fields:
     - `credits_backend_mode`
     - `credits_backend_ok`
     - `credits_backend_error`
  2) Confirm `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are present in `/etc/agentic-backend.env`.
  3) Confirm bypass state intentionally:
     - `AI_CREDITS_BYPASS=true` is emergency-only and should not be left on unintentionally.
  4) Restart backend/worker after env correction and re-check `/api/credits`.
  5) Verify generation endpoints now return normal credit outcomes (not `CREDITS_UNAVAILABLE`).

#### Set user generation entitlement (service role SQL)
- Set `admin` (wallet bypass / operator access):
```sql
select * from public.set_generation_plan_by_email('david.vikstrand@gmail.com', 'admin', null);
```
- Set `plus` (uses `CREDIT_WALLET_PLUS_DAILY_GRANT` unless overridden):
```sql
select * from public.set_generation_plan_by_email('user@example.com', 'plus', null);
```
- Set custom override:
```sql
select * from public.set_generation_plan_by_email('user@example.com', 'plus', 100);
```

### `TIMEOUT`
- Meaning: pipeline exceeded max timeout.
- Action:
  1) Confirm `YT2BP_CORE_TIMEOUT_MS` value is sane for current load.
  2) Keep `/youtube` in core-first mode (review/banner async) for user flows.
  3) Validate transcript provider latency.
  4) Check OpenAI latency and retries.

### `SAFETY_BLOCKED`
- Meaning: generated output violated content safety policy.
- Action:
  1) Confirm expected for source video category.
  2) Inspect `yt2bp-content-safety` log lines for flagged criteria.
  3) Do not bypass by default; only tune policy with explicit decision.

### `GENERATION_FAIL`
- Meaning: generation/quality stage failed after retries.
- Action:
  1) Inspect `yt2bp-quality` logs for failing criteria.
  2) Verify `OPENAI_API_KEY` and model availability.
  3) If incident pressure: use fallback profile below.

### `JOB_ALREADY_RUNNING`
- Meaning: a manual refresh generation job is already active for this user.
- Action:
  1) Use `GET /api/ingestion/jobs/<job_id>` (user auth) to track completion.
  2) Wait for terminal state (`succeeded|failed`) before launching a new refresh-generate run.
  3) If job appears stuck, inspect stale recovery settings (`INGESTION_STALE_RUNNING_MS`).

### `INSUFFICIENT_CREDITS`
- Meaning: user wallet could not reserve enough credits for source-video unlock.
- Action:
  1) Check `/api/credits` response fields (`balance`, `capacity`, `daily_grant`, `next_reset_at`, `plan`).
  2) Confirm wallet env defaults are set as expected (`CREDIT_WALLET_*`).
  3) Verify user has active subscriptions on the source page.
  4) Verify `credit_ledger` latest rows for the user (`hold/refund/settle`) match expected unlock attempts.

### `UNLOCK_RESERVATION_EXPIRED` or `UNLOCK_GENERATION_FAILED`
- Meaning: unlock reservation expired or queued generation failed; held credits should be refunded.
- Action:
  1) Inspect `source_item_unlocks` row (`status`, `last_error_code`, `last_error_message`, `reservation_expires_at`).
  2) Inspect `credit_ledger` for matching `hold` and `refund` entries via `unlock_id`.
  3) Correlate unlock logs via `trace_id` from unlock response (`unlock_request_received` -> `unlock_item_*` -> `unlock_job_terminal`).
  4) Retry unlock from source page after verifying provider health.

### `NO_TRANSCRIPT_PERMANENT`
- Meaning: video was confirmed as no-speech/no-usable-transcript after bounded retries, so it should not remain unlockable.
- Also covers terminal transcript provider outcomes when fail-fast is enabled (`VIDEO_UNAVAILABLE`, `ACCESS_DENIED`).
- Action:
  1) Inspect `source_item_unlocks` (`last_error_code`, `transcript_status`, `transcript_attempt_count`, `transcript_no_caption_hits`).
  2) Confirm `transcript_status='confirmed_no_speech'` before treating as permanent.
  3) Confirm locked-card suppression on `My Feed`, Home `For You`, profile feed, and Source Page Video Library.
  4) Do not enqueue retry jobs for confirmed permanent rows; only transient transcript errors should retry.

### `candidate_pending_manual_review` growth
- Meaning: gate pipeline is producing warn outcomes (fit/quality) and routing to manual review.
- Action:
  0) Confirm runtime mode first (`CHANNEL_GATES_MODE`).
     - if `bypass`, this state should be rare/unexpected and likely indicates fallback/no-backend path.
     - if `enforce`, continue with the checks below.
  1) Inspect `channel_gate_decisions` for dominant `reason_code`.
  2) Verify candidate inputs (channel slug, tags, step_count) are mapped correctly.
  3) If noisy channel-fit warns dominate, tune fit policy before enabling broader auto paths.

### Misclassification / too many `general` publishes
- Meaning: channel labeling is falling back too often or classifier signal quality dropped.
- Action:
  1) Verify classifier env: `AUTO_CHANNEL_CLASSIFIER_MODE` is expected for this rollout (`deterministic_v1` or `llm_labeler_v1`).
  2) Verify fallback slug is valid: `AUTO_CHANNEL_FALLBACK_SLUG=general` (or another curated slug that exists).
  3) Inspect auto-publish response/log metadata (`classifier_reason`) to split:
     - deterministic mode: `tag_match|alias_match|fallback_general`
     - llm mode: `llm_valid|llm_retry_valid|fallback_general`
  4) If emergency rollback needed, temporarily set `AUTO_CHANNEL_CLASSIFIER_MODE=general_placeholder`.

### `channel_rejected` spike
- Meaning: block outcomes (safety/PII/quality) are increasing and channel publish throughput drops.
- Action:
  0) Confirm runtime mode first (`CHANNEL_GATES_MODE`).
     - in `bypass`, reject spikes should come from explicit manual reject paths, not automated gate blocks.
  1) Inspect `channel_gate_decisions.reason_code` distribution.
  2) Confirm reject path is preserving personal visibility (My Feed should remain visible).
  3) Escalate only after checking for source-content drift (e.g., different incoming topic mix).

## Rollback / fallback controls
Incident profile (temporary):
- Keep endpoint up, reduce strictness first:
  - `YT2BP_QUALITY_ENABLED=false`
  - `YT2BP_CONTENT_SAFETY_ENABLED=true`
- If provider instability dominates:
  - keep endpoint enabled but switch transcript provider.
- Full stop (hard off):
  - `YT2BP_ENABLED=false`

After env change:
```bash
ssh oracle-free 'sudo systemctl restart agentic-backend.service'
```

## Post-deploy confidence checks
- Release smoke:
```bash
npm run smoke:release -- --api-base-url https://api.bleup.app --frontend-base-url https://dsvikstrand.github.io/remix-of-stackwise-advisor --release-sha "$RELEASE_SHA"
```
- YT2BP repro smoke:
```bash
npm run smoke:yt2bp -- --base-url https://bapi.vdsai.cloud
```
- Metrics summary (Oracle logs):
```bash
ssh oracle-free 'cd /home/ubuntu/remix-of-stackwise-advisor && npm run metrics:yt2bp -- --source journalctl --json'
```

## Source-page migration verification
- Confirm schema objects exist:
```sql
select to_regclass('public.source_pages') as source_pages_table,
       to_regclass('public.user_source_subscriptions') as subscriptions_table,
       to_regclass('public.source_items') as source_items_table;
```
- Confirm backfill linkage counts are non-zero:
```sql
select
  (select count(*) from public.source_pages where platform = 'youtube') as source_pages_youtube,
  (select count(*) from public.user_source_subscriptions where source_page_id is not null) as subscriptions_linked,
       (select count(*) from public.source_items where source_page_id is not null) as source_items_linked;
```
- Visual hydration check (legacy rows):
  - open `GET /api/source-pages/youtube/<channel_id>` for a known backfilled channel.
  - if `avatar_url`/`banner_url` were null, first read now attempts YouTube asset hydration and persists filled values.

## Candidate lifecycle smoke (auth required)
Use a valid bearer token and existing `user_feed_item_id`.
```bash
curl -sS -X POST https://bapi.vdsai.cloud/api/channel-candidates \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"user_feed_item_id":"<uuid>","channel_slug":"skincare"}'
```

```bash
curl -sS -X POST https://bapi.vdsai.cloud/api/channel-candidates/<candidate_id>/evaluate \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json'
```

## Subscription + ingestion smoke
YouTube search smoke (auth required):
```bash
curl -sS "https://bapi.vdsai.cloud/api/youtube-search?q=skincare%202026%20best&limit=10" \
  -H "Authorization: Bearer $TOKEN"
```

YouTube channel search smoke (auth required):
```bash
curl -sS "https://bapi.vdsai.cloud/api/youtube-channel-search?q=skincare%20doctor&limit=10" \
  -H "Authorization: Bearer $TOKEN"
```

YouTube OAuth status (auth required):
```bash
curl -sS "https://bapi.vdsai.cloud/api/youtube/connection/status" \
  -H "Authorization: Bearer $TOKEN"
```

YouTube OAuth start (auth required; open returned `auth_url` in browser):
```bash
curl -sS -X POST https://bapi.vdsai.cloud/api/youtube/connection/start \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"return_to":"https://dsvikstrand.github.io/remix-of-stackwise-advisor/subscriptions"}'
```

YouTube import preview (auth required):
```bash
curl -sS "https://bapi.vdsai.cloud/api/youtube/subscriptions/preview" \
  -H "Authorization: Bearer $TOKEN"
```

YouTube import selected channels (auth required):
```bash
curl -sS -X POST https://bapi.vdsai.cloud/api/youtube/subscriptions/import \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"channels":[{"channel_id":"UC_x5XG1OV2P6uZZ5FSM9Ttw","channel_url":"https://www.youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw","channel_title":"Google for Developers"}]}'
```

Disconnect YouTube OAuth link (auth required; imported app subscriptions remain):
```bash
curl -sS -X DELETE https://bapi.vdsai.cloud/api/youtube/connection \
  -H "Authorization: Bearer $TOKEN"
```

Create a subscription (MVP auto-only behavior):
```bash
curl -sS -X POST https://bapi.vdsai.cloud/api/source-subscriptions \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"channel_input":"https://www.youtube.com/@AliAbdaal"}'
```
Expected behavior:
- first subscribe sets checkpoint only (no old-video prefill).
- one `subscription_notice` feed item is inserted for this user/channel.
- future uploads are ingested automatically.
- subscription rows returned by `GET /api/source-subscriptions` may include `source_channel_avatar_url` from stored `source_pages` metadata; missing avatars return `null` and should not trigger live YouTube asset fetches on the request path.
- `subscription_notice` source metadata may include `channel_banner_url` for notice-card backgrounds.
- unsubscribing (`DELETE /api/source-subscriptions/:id`) removes the user-scoped notice card from My Feed for that channel.
- subscription auto-ingest generation runs with review enabled and banner disabled by default.

Manual refresh scan (auth required):
```bash
curl -sS -X POST https://bapi.vdsai.cloud/api/source-subscriptions/refresh-scan \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"max_per_subscription":5,"max_total":50}'
```
Expected behavior:
- response includes candidate rows and `cooldown_filtered` count (failed items hidden during retry cooldown).
- rate-limited retries return `RATE_LIMITED`.

Manual refresh enqueue (auth required):
```bash
curl -sS -X POST https://bapi.vdsai.cloud/api/source-subscriptions/refresh-generate \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"items":[{"subscription_id":"<uuid>","source_channel_id":"<channel_id>","video_id":"<video_id>","video_url":"https://www.youtube.com/watch?v=<video_id>","title":"<title>"}]}'
```
Expected behavior:
- request returns quickly with `job_id` and `queued_count`
- generation continues asynchronously in background
- progress is visible via `ingestion_jobs` (scope `manual_refresh_selection`) and resulting My Feed inserts
- successful generation advances subscription checkpoint forward (`last_seen_published_at` / `last_seen_video_id`) for touched subscriptions
- route guardrails:
  - max selected items per run = `20` (`MAX_ITEMS_EXCEEDED`)
  - one active manual refresh job per user (`JOB_ALREADY_RUNNING`)
  - per-user cooldown (`REFRESH_GENERATE_COOLDOWN_MS`)

Manual refresh job status (user auth):
```bash
curl -sS https://bapi.vdsai.cloud/api/ingestion/jobs/<job_id> \
  -H "Authorization: Bearer $TOKEN"
```

Latest manual refresh job for current user (user auth):
```bash
curl -sS "https://bapi.vdsai.cloud/api/ingestion/jobs/latest-mine?scope=manual_refresh_selection" \
  -H "Authorization: Bearer $TOKEN"
```

User-triggered sync (operator/debug path):
```bash
curl -sS -X POST https://bapi.vdsai.cloud/api/source-subscriptions/<subscription_id>/sync \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{}'
```

Service cron trigger:
```bash
curl -sS -X POST https://bapi.vdsai.cloud/api/ingestion/jobs/trigger \
  -H "x-service-token: $INGESTION_SERVICE_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{}'
```

Latest ingestion job snapshot:
```bash
curl -sS https://bapi.vdsai.cloud/api/ingestion/jobs/latest \
  -H "x-service-token: $INGESTION_SERVICE_TOKEN"
```

Staleness guidance:
- If latest `finished_at` is older than 90 minutes, treat ingestion as delayed and start triage.
- If latest `status` is `failed` or `error_code` is `PARTIAL_FAILURE`, inspect per-subscription `last_sync_error`.
- If latest endpoint reports no jobs, verify Oracle cron registration first.

Debug simulation trigger (single subscription, non-prod only):
```bash
curl -sS -X POST https://bapi.vdsai.cloud/api/debug/subscriptions/<subscription_id>/simulate-new-uploads \
  -H "x-service-token: $INGESTION_SERVICE_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"rewind_days":30}'
```
Notes:
- endpoint returns `404` unless `ENABLE_DEBUG_ENDPOINTS=true`.
- endpoint uses service-token auth only; do not send/require a user bearer token.
- endpoint rewinds checkpoint for one subscription, then runs one sync cycle.
- this can generate blueprints and consume tokens/credits.
- source YouTube generation paths are thumbnail-first and bypass auto-banner enqueue; async auto-banner jobs only apply to compatibility/non-source paths when enabled.

Auto-banner worker trigger (service auth):
```bash
curl -sS -X POST https://bapi.vdsai.cloud/api/auto-banner/jobs/trigger \
  -H "x-service-token: $INGESTION_SERVICE_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{}'
```

Subscription input note:
- Handle URLs may resolve via `browseId` fallback parsing when direct `channelId` metadata is absent in YouTube page HTML.

Pending card actions (compatibility path for legacy pending items):
```bash
curl -sS -X POST https://bapi.vdsai.cloud/api/my-feed/items/<user_feed_item_id>/accept \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{}'
```

```bash
curl -sS -X POST https://bapi.vdsai.cloud/api/my-feed/items/<user_feed_item_id>/skip \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{}'
```

## Oracle cron setup
Example cron entry:
```bash
*/30 * * * * curl -sS -X POST https://bapi.vdsai.cloud/api/ingestion/jobs/trigger -H \"x-service-token: ${INGESTION_SERVICE_TOKEN}\" -H 'Content-Type: application/json' --data '{}' >> /var/log/bleuv1-ingestion-cron.log 2>&1
```

Auto-banner worker cron example (every 5 minutes):
```bash
*/5 * * * * curl -sS -X POST https://bapi.vdsai.cloud/api/auto-banner/jobs/trigger -H \"x-service-token: ${INGESTION_SERVICE_TOKEN}\" -H 'Content-Type: application/json' --data '{}' >> /var/log/bleuv1-auto-banner-cron.log 2>&1
```

## Ingestion reliability triage
1. Confirm cron is running and writing logs:
```bash
ssh oracle-free 'sudo crontab -l | grep ingestion/jobs/trigger'
ssh oracle-free 'tail -n 100 /var/log/bleuv1-ingestion-cron.log'
```
2. Check latest ingestion snapshot:
```bash
curl -sS https://bapi.vdsai.cloud/api/ingestion/jobs/latest -H "x-service-token: $INGESTION_SERVICE_TOKEN"
```
3. If delayed/failed, inspect backend logs:
```bash
ssh oracle-free 'sudo journalctl -u agentic-backend.service -n 200 --no-pager'
```
4. Spot-check subscription rows in app UI (`/subscriptions`) via `Sync issue`, `Last polled`, and health detail text.

## Traceability keys and expected logs
Required IDs for triage:
- `run_id`
- `source_item_id`
- `user_feed_item_id`
- `candidate_id`
- `channel_slug`
- `reason_code` (when applicable)

Expected structured server log markers:
- `[candidate_gate_result]`
- `[candidate_manual_review_pending]`
- `[candidate_published]`
- `[candidate_rejected]`
- `[subscription_skip_upcoming_premiere]` (pre-release YouTube premiere filtered during sync)
- `[subscription_auto_unlock_not_queued]` with `reason=PERMANENT_NO_TRANSCRIPT` (non-retryable no-transcript auto-unlock skip)

Useful `mvp_events.event_name` chain for YT2BP split flow:
- `source_pull_requested`
- `source_pull_succeeded`
- `youtube_review_started|youtube_review_succeeded|youtube_review_failed`
- `youtube_banner_started|youtube_banner_succeeded|youtube_banner_failed`
- `my_feed_publish_succeeded`
- `candidate_submitted`
- `candidate_gate_result`
- `channel_publish_succeeded|channel_publish_rejected`
