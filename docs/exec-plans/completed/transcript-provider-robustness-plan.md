# Transcript Provider Robustness Plan

Status: `completed`

Completion note
a0) [have] Root-active plan cleanup on `2026-03-15` moved this file to `completed/` after Phases 1-6 were implemented.
a00) [have] The only remaining follow-up is later live-rollout proof, now carried in `docs/exec-plans/active/tail/mvp-launch-proof-tail.md`.

## Goal
a1) [todo] Make the transcript stage more resilient without redesigning the app flow, by strengthening the existing provider seam:
- `videoId -> transcript provider -> TranscriptResult -> rest of YT2BP`

## Current Baseline
b1) [have] Shared Webshare proxy support for `videotranscriber_temp` is now implemented and verified locally.
b2) [have] Real local proof exists for:
- proxied `videotranscriber_temp -> transcript`
- proxied `videotranscriber_temp -> /api/youtube-to-blueprint -> completed blueprint`
b3) [have] The remaining fragility is no longer proxy-path wiring. It is provider reliability and fallback behavior at the transcript boundary.
b4) [have] Current transcript robustness already includes:
- provider-local `start` retry for temp-provider queue-full (`164002`)
- provider-specific transcript retry/circuit state inside transcript service
- optional transcript throttle
- interactive transcript-provider fallback
- persistent transcript cache reuse by `video_id`
b5) [todo] Current gaps remain:
- no cache freshness/TTL policy exists yet

## Scope Lock
c1) [todo] Keep this plan strictly inside the transcript-provider boundary.
c2) [todo] Do not widen scope to backend cleanup, generation redesign, or provider replacement.
c3) [todo] Preserve the current YT2BP route contract and downstream blueprint pipeline.
c4) [todo] Treat `videotranscriber_temp` as a temporary development provider, not production runtime truth.

## Phases
d1) [have] Phase 1: split generic temp-provider failures into explicit error classes.
Goal:
- stop treating important upstream temp-provider states as generic `TRANSCRIPT_FETCH_FAIL`
Implementation direction:
- update `server/transcript/providers/videoTranscriberTempProvider.ts`
- classify known upstream codes/messages into clearer buckets, for example:
  - daily-limit style failure
  - queue-full style failure
  - upstream gateway/tunnel transport failure
  - session/anti-bot rejection if it becomes reproducible
Acceptance:
- provider debug and final error code clearly distinguish `retry`, `fallback`, and `stop`

d2) [have] Phase 2: add transcript-provider fallback for interactive YT2BP.
Goal:
- if `videotranscriber_temp` fails, interactive YT2BP gets a second chance without the user manually retrying the whole request
Implementation direction:
- keep current provider seam
- recommended fallback order:
  - `videotranscriber_temp`
  - `youtube_timedtext`
- fallback only on retryable/provider-unavailable classes
- do not fallback on clearly terminal classes like:
  - `VIDEO_UNAVAILABLE`
  - `ACCESS_DENIED`
  - `NO_CAPTIONS`
  - `TRANSCRIPT_EMPTY`
Acceptance:
- one reproduced temp-provider failure can still produce a successful blueprint through fallback
- returned transcript transport metadata reflects the actual provider used
Status note:
- interactive fallback now runs in transcript-service order:
  - configured primary provider first
  - then remaining providers in stable registry order
- fallback stops on:
  - `VIDEO_UNAVAILABLE`
  - `ACCESS_DENIED`
  - `NO_CAPTIONS`
  - `TRANSCRIPT_EMPTY`
- fallback continues on:
  - `RATE_LIMITED`
  - `TIMEOUT`
  - `TRANSCRIPT_FETCH_FAIL`
  - `VIDEOTRANSCRIBER_UPSTREAM_UNAVAILABLE`
  - `VIDEOTRANSCRIBER_DAILY_LIMIT`

d3) [have] Phase 3: make resilience state provider-specific.
Goal:
- one degraded transcript provider must not poison the others
Implementation direction:
- replace coarse transcript resilience keys with provider-specific keys such as:
  - `transcript:videotranscriber_temp`
  - `transcript:youtube_timedtext`
- apply this to retry/circuit state only
Acceptance:
- repeated temp-provider failures do not open or degrade the circuit for `youtube_timedtext`
Status note:
- transcript retry/circuit ownership now lives inside the transcript service per provider attempt
- active keys now use:
  - `transcript:videotranscriber_temp`
  - `transcript:youtube_timedtext`
- interactive fallback preserves Phase 2 order, but each provider attempt now records resilience state on its own key
- the coarse pipeline-level `transcript` retry/circuit bucket is no longer used for new transcript activity

d4) [have] Phase 4: add transcript result caching by `video_id`.
Goal:
- avoid repeatedly hitting fragile upstream providers for the same successful transcript
Implementation direction:
- cache only successful normalized transcript results
- key by stable YouTube `video_id`
- reuse cached transcript before calling upstream providers
- keep cache origin visible in trace/debug metadata, not user-facing contract changes
Acceptance:
- repeated YT2BP runs for the same video can reuse a cached transcript
- transcript transport/debug surfaces remain decision-complete
Status note:
- successful transcript results are now cached in `public.youtube_transcript_cache`
- transcript service checks cache before provider retry/fallback
- cache writes happen only after successful final transcript fetch
- cache reads/writes fail open so cache issues do not block blueprint generation

d5) [have] Phase 5: add stage-aware retry policy only after Phases 1-4 are stable.
Goal:
- retry smarter, not simply more often
Implementation direction:
- keep behavior stage-specific, for example:
  - temp-provider `start` queue-full -> retry/rotate session
  - daily-limit -> do not waste retry; fallback or stop
  - poll-timeout -> bounded retry only if justified
  - transcript-resolution-empty -> fallback, not blind retry
Acceptance:
- fewer wasted retries
- faster final outcomes
- clearer trace logs for why a retry happened
Status note:
- temp-provider retry decisions are now stage-aware in transcript service
- same-provider retry is preserved for early transient temp-provider stages like:
  - `runtime_config`
  - `url_info`
  - `start`
- fallback is now preferred instead of blind same-provider rerun for:
  - `VIDEOTRANSCRIBER_DAILY_LIMIT`
  - temp `RATE_LIMITED` after exhausted `start` retries
  - temp `TIMEOUT` at `poll`
  - temp `TRANSCRIPT_EMPTY` at `transcript_resolution`
- non-temp providers keep bounded same-provider retry on generic retryable classes

d6) [have] Phase 6: retire the legacy `yt_to_text` runtime/config branch.
Goal:
- remove `yt_to_text` from active runtime, tests, env examples, and current docs
Implementation direction:
- keep runtime/fallback chain to:
  - `videotranscriber_temp`
  - `youtube_timedtext`
- rename shared Webshare transport env/debug surfaces away from `yt_to_text`
- clean stale `transcript:yt_to_text` and cached `yt_to_text` rows from Supabase
Acceptance:
- no active runtime path, env, or current doc describes `yt_to_text` as available behavior
Status note:
- active runtime/fallback now keeps only:
  - `videotranscriber_temp`
  - `youtube_timedtext`
- shared Webshare transport env/debug surfaces are now generic:
  - `TRANSCRIPT_USE_WEBSHARE_PROXY`
  - `/api/debug/transcript/reset-proxy`
- Supabase cleanup migration now removes legacy `transcript:yt_to_text` circuit rows and cached `yt_to_text` transcript rows
- transcript cache now ignores legacy `yt_to_text` rows even before the cleanup migration is applied

## Execution Order
e1) [todo] Implement Phase 1 first.
Reason:
- highest signal, lowest risk, and it improves every later decision

e2) [todo] Implement Phase 2 second.
Reason:
- biggest user-facing robustness gain

e3) [todo] Implement Phase 3 third.
Reason:
- prevents coarse provider degradation from creating false-wide failures

e4) [todo] Implement Phase 4 fourth.
Reason:
- high leverage, but introduces state/persistence and should come after clearer failure semantics

e5) [todo] Implement Phase 5 last.
Reason:
- best done after the earlier phases define stable error and fallback behavior

## Validation Boundaries
f1) [have] Phase 1 proof:
- one known temp-provider daily-limit or upstream-failure case now emits a narrower, explicit error class

f2) [have] Phase 2 proof:
- transcript-service fallback tests now prove:
  - `VIDEOTRANSCRIBER_DAILY_LIMIT -> youtube_timedtext` success
  - `VIDEOTRANSCRIBER_UPSTREAM_UNAVAILABLE -> youtube_timedtext` success
  - `RATE_LIMITED -> youtube_timedtext` success
  - terminal stop behavior for `NO_CAPTIONS`, `VIDEO_UNAVAILABLE`, `ACCESS_DENIED`, and `TRANSCRIPT_EMPTY`
- local app-level smoke remains optional follow-up when a deterministic forced temp-provider failure setup is available

f3) [have] Phase 3 proof:
- transcript-service tests now prove:
  - interactive fallback attempts use `transcript:videotranscriber_temp` then `transcript:youtube_timedtext`
  - background single-provider fetch uses only the selected provider key
  - no new transcript fetch path writes to generic `transcript`
- queue-health ops tests now prove the provider circuit snapshot requests:
  - `transcript:videotranscriber_temp`
  - `transcript:youtube_timedtext`
  instead of generic `transcript`

f4) [have] Phase 4 proof:
- transcript-service tests now prove:
  - cache hits return a transcript without calling upstream providers
  - first request writes a successful transcript and second request reuses it
  - fallback winner is what gets cached
  - failures and empty transcripts do not write cache
- transcript-cache unit tests now prove:
  - DB rows hydrate back into normalized `TranscriptResult`
  - cache writes persist normalized transcript/provider metadata
- local DB-backed end-to-end smoke remains optional follow-up when a linked Supabase env is available

f5) [have] Phase 5 proof:
- transcript-service tests now prove:
  - temp `RATE_LIMITED` at `start` falls to fallback without an extra outer retry
  - temp `VIDEOTRANSCRIBER_UPSTREAM_UNAVAILABLE` at early stages retries same provider before fallback
  - temp `TIMEOUT` at `poll` falls to fallback instead of rerunning the same provider
  - temp `TRANSCRIPT_EMPTY` at `transcript_resolution` falls to fallback
  - non-temp `TIMEOUT` still gets bounded same-provider retry
- existing pipeline transcript tests still pass after the retry-policy refinement

f6) [have] Phase 6 proof:
- targeted validation now passes after the retirement patch:
  - `npm run typecheck`
  - focused transcript/provider/ops/pipeline tests
  - `npm run docs:refresh-check -- --json`
  - `npm run docs:link-check`
- active runtime surfaces now use generic transcript proxy naming and no longer resolve `yt_to_text`
- local backend boot still works after the retirement patch:
  - backend started on `:8787`
  - `/api/health` returned `{"ok":true}`

f7) [todo] Follow-up live-success proof:
- this session did not reproduce a full live success-path YT2BP smoke after retirement because upstream transcript providers were externally constrained:
  - temp-provider attempts hit `VIDEOTRANSCRIBER_DAILY_LIMIT`
  - timedtext fallback samples returned `NO_CAPTIONS`
- this is a remaining proof gap for one later local/live success sample, not a reproduced runtime regression from the `yt_to_text` retirement patch

## Anti-Circle Rules
g1) [todo] Close one robustness gap at a time.
g2) [todo] Do not mix fallback, caching, and retry-policy redesign into one patch.
g3) [todo] Keep proof localized to the transcript boundary before discussing broader pipeline quality.
g4) [todo] If a failure can already be explained by an earlier open phase, do not open a second broader blocker.

## Assumptions
h1) [have] The fastest path to better reliability is to strengthen the existing provider seam rather than redesigning the app flow.
h2) [have] `videotranscriber_temp` remains a temporary development provider and should not become the long-term runtime contract.
h3) [have] The first robustness wins should prioritize clearer failure classification and automatic fallback over broader caching or persistence changes.
h4) [have] This plan should stay compatible with later migration to a stable transcript API.
