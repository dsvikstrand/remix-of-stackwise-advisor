# Transcript Provider Launch Plan

Status: `active`

## Goal
a1) [todo] Push and launch the current transcript-provider setup in a controlled way, including the Supabase migrations that activate transcript caching and clean legacy `yt_to_text` state.

## Status
b1) [have] The transcript-provider code path is implemented locally:
- `videotranscriber_temp` is the active runtime provider path
- `yt_to_text` is retired from active runtime
- transcript cache support exists in code and migrations
b2) [have] Local docs/typecheck/targeted-test validation is already green.
b3) [todo] The two Supabase migrations still need to be applied remotely:
- `supabase/migrations/20260314183000_youtube_transcript_cache_v1.sql`
- `supabase/migrations/20260314203000_retire_yt_to_text_legacy_state.sql`
b4) [todo] One post-deploy real `/api/youtube-to-blueprint` success proof is still needed when upstream provider conditions allow it.

## Scope
c1) [todo] Keep this plan narrow:
- push current repo state
- confirm CI
- apply Supabase migrations in safe order
- deploy backend/frontend
- run post-deploy proof checks
c2) [todo] Do not widen this plan into new feature work, manual channel-flow cleanup, or new transcript-provider implementation.

## Steps
d1) [have] Step 1: repo preflight
- confirm release branch is `main`
- confirm local validation is green before push:
  - `npm run typecheck`
  - targeted tests for changed seams
  - `npm run docs:refresh-check -- --json`
  - `npm run docs:link-check`
- sweep result (`2026-03-15`):
  - branch/worktree check: `git status -sb` on `main`
  - `npm run typecheck` passed
  - `npm run build` passed
  - targeted runtime suite passed:
    - `src/test/transcriptServiceBackend.test.ts`
    - `src/test/videoTranscriberTempProvider.test.ts`
    - `src/test/transcriptCacheBackend.test.ts`
    - `src/test/providerResilience.test.ts`
    - `src/test/youtubeBlueprintPipelineTranscriptPrune.test.ts`
    - `src/test/sourcePagesHandlers.test.ts`
    - `src/test/sourceSubscriptionsHandlers.test.ts`
    - `src/test/youtubeHandlers.test.ts`
  - `npm run docs:refresh-check -- --json` passed
  - `npm run docs:link-check` passed

d2) [todo] Step 2: push and CI confirmation
- push the current repo state
- wait for CI to pass on the pushed commit
- do not continue if CI is red

d3) [todo] Step 3: apply the additive migration first
- apply `supabase/migrations/20260314183000_youtube_transcript_cache_v1.sql`
- verify remote migration watermark
- verify `youtube_transcript_cache` exists before moving on

d4) [todo] Step 4: verify behavior before cleanup migration
- run one safe backend/app smoke after the additive migration
- confirm normal app boot and transcript fetch behavior still look correct
- stop here if the additive migration introduces unexpected behavior

d5) [todo] Step 5: apply the legacy cleanup migration second
- apply `supabase/migrations/20260314203000_retire_yt_to_text_legacy_state.sql`
- verify migration watermark and one post-apply DB sanity check
- treat this as the cautious step because it deletes legacy rows

d6) [todo] Step 6: deploy backend/frontend
- deploy the same commit that passed CI
- restart/reload services through the normal deploy path
- keep deploy and DB rollout tied to the same release window

d7) [todo] Step 7: run post-deploy proof checks
- verify `/api/health`
- verify one normal authenticated app flow
- run one real `/api/youtube-to-blueprint` smoke if upstream provider conditions allow it
- confirm transcript-provider metadata reflects the current runtime path

d8) [todo] Step 8: record outcome
- if rollout checks pass, record the launch evidence in `docs/ops/mvp-launch-readiness-checklist.md`
- if a step fails, stop and fix forward before continuing

## Rollback Rule
e1) [have] Supabase rollback is controlled, not automatic.
e2) [have] Additive migration rollback path: follow-up migration if needed.
e3) [have] Cleanup/delete migration rollback path: forward-fix migration or backup/PITR recovery if necessary.
e4) [have] Deployment rollback path: redeploy the previous known-good commit if runtime behavior regresses.

## Completion Rule
f1) [todo] Move this file to `docs/exec-plans/completed/` when the push, migrations, deploy, and post-deploy transcript-provider proof checks are all complete and recorded.
