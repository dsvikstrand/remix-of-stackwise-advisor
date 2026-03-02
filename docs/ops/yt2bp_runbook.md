# YT2BP Runbook

## Purpose and ownership
- Service: YouTube to Blueprint (`/api/youtube-to-blueprint`)
- Runtime host: Oracle (`oracle-free`)
- Service unit: `agentic-backend.service`
- Primary owner: app backend maintainers

## bleuV1 source-first integration context
- YT2BP remains the ingestion/generation entrypoint only.
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
  - Tier test endpoints (auth):
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
  - new subscription uploads auto-attempt shared unlock generation by prioritizing the current subscriber first, then sampling up to 3 eligible subscribers (`is_active=true`, `auto_unlock_enabled=true`) and stopping on first successful hold + enqueue.
  - if all sampled users fail credit reserve, backend enqueues bounded `source_auto_unlock_retry` jobs so unlock can complete after credit refill.
  - if sampled users cannot reserve credits, item remains `my_feed_unlockable` for manual unlock.

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
- Pull + restart:
```bash
ssh oracle-free 'cd /home/ubuntu/remix-of-stackwise-advisor && git pull --ff-only && sudo systemctl restart agentic-backend.service'
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
- `YT2BP_CLIENT_TRANSCRIPT_ENABLED` (default `true`; allows direct endpoint to accept browser-supplied transcript text)
- `YT2BP_CLIENT_TRANSCRIPT_MAX_CHARS` (default `120000`; rejects oversized browser transcript payloads)
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
- `REFRESH_GENERATE_MAX_ITEMS` (default `20`)
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
- `SOURCE_AUTO_UNLOCK_SAMPLE_SIZE` (default `3`)
- `SOURCE_AUTO_UNLOCK_RETRY_DELAY_SECONDS` (default `90`)
- `SOURCE_AUTO_UNLOCK_RETRY_MAX_ATTEMPTS` (default `3`)
- `SOURCE_TRANSCRIPT_RETRY_DELAY_SECONDS` (default `300`)
- `SOURCE_TRANSCRIPT_RETRY_DELAY_ATTEMPT1_SECONDS` (default `300`)
- `SOURCE_TRANSCRIPT_RETRY_DELAY_ATTEMPT2_SECONDS` (default `900`)
- `SOURCE_TRANSCRIPT_RETRY_DELAY_ATTEMPT3_SECONDS` (default `2700`)
- `SOURCE_TRANSCRIPT_MAX_ATTEMPTS` (default `3`)
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
- `INGESTION_LATEST_MINE_WINDOW_MS` (default `60000`)
- `INGESTION_LATEST_MINE_MAX_PER_WINDOW` (default `180`)
- `UNLOCK_INTAKE_ENABLED` (default `true`, fast pause for new unlock intake)
- `QUEUE_DEPTH_HARD_LIMIT` (default `1000`)
- `QUEUE_DEPTH_PER_USER_LIMIT` (default `50`)
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
- `GENERATION_TIER_FREE_USER_IDS` (optional csv free allowlist; others default free)
- `GENERATION_TIER_FREE_MODEL` (default `gpt-5-mini`)
- `GENERATION_TIER_FREE_FALLBACK_MODEL` (default follows `OPENAI_GENERATION_FALLBACK_MODEL`)
- `GENERATION_TIER_FREE_REASONING_EFFORT` (default follows `OPENAI_GENERATION_REASONING_EFFORT`)
- `GENERATION_TIER_TIER_MODEL` (default `gpt-5.2`)
- `GENERATION_TIER_TIER_FALLBACK_MODEL` (default follows `OPENAI_GENERATION_FALLBACK_MODEL`)
- `GENERATION_TIER_TIER_REASONING_EFFORT` (default `low`)
- `YT2BP_TIER_ONE_STEP_ENABLED` (default `false`; when enabled, tier uses one-step prompt and skips pass2 transform)
- `YT2BP_TIER_ONE_STEP_PROMPT_TEMPLATE_PATH` (default `docs/golden_blueprint/golden_bp_prompt_contract_one_step_v1.md`)
- `GENERATION_TIER_DUAL_GENERATE_ENABLED` (default `false`; dev compare mode for queue surfaces)
- `GENERATION_TIER_DUAL_GENERATE_USER_IDS` (csv user ids allowlisted for dual-generate mode)
- `GENERATION_TIER_DUAL_GENERATE_SCOPE` (default `queue_only`)
- `GENERATION_TIER_DUAL_GENERATE_CREDIT_MODE` (default `none`; queue-source unlock flow bypasses hold/settle/refund for dual-mode users)
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
- `YT2BP_CLIENT_TRANSCRIPT_ENABLED=true`
- `YT2BP_CLIENT_TRANSCRIPT_MAX_CHARS=120000`
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
- `REFRESH_GENERATE_MAX_ITEMS=20`
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
- `SOURCE_AUTO_UNLOCK_SAMPLE_SIZE=3`
- `SOURCE_AUTO_UNLOCK_RETRY_DELAY_SECONDS=90`
- `SOURCE_AUTO_UNLOCK_RETRY_MAX_ATTEMPTS=3`
- `SOURCE_TRANSCRIPT_RETRY_DELAY_SECONDS=300`
- `SOURCE_TRANSCRIPT_RETRY_DELAY_ATTEMPT1_SECONDS=300`
- `SOURCE_TRANSCRIPT_RETRY_DELAY_ATTEMPT2_SECONDS=900`
- `SOURCE_TRANSCRIPT_RETRY_DELAY_ATTEMPT3_SECONDS=2700`
- `SOURCE_TRANSCRIPT_MAX_ATTEMPTS=3`
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
- `QUEUE_DEPTH_HARD_LIMIT=1000`
- `QUEUE_DEPTH_PER_USER_LIMIT=50`
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
  1) Check `/api/credits` response fields (`balance`, `capacity`, `refill_rate_per_sec`, `seconds_to_full`).
  2) Confirm wallet env defaults are set as expected (`CREDIT_WALLET_*`).
  3) Verify user has active subscriptions on the source page (cost is subscriber-based and can drop as followers increase).
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
- Repro smoke:
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
- subscription rows returned by `GET /api/source-subscriptions` may include `source_channel_avatar_url` (read-time enrichment from YouTube API).
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
