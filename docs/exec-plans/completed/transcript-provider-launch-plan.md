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
b3) [have] The Supabase migrations needed for this launch are now applied remotely:
- `supabase/migrations/20260314183000_youtube_transcript_cache_v1.sql`
- `supabase/migrations/20260314203000_retire_yt_to_text_legacy_state.sql`
b4) [todo] One post-deploy real `/api/youtube-to-blueprint` success proof is still needed when upstream provider conditions allow it.
b5) [have] Sweep 3 blocker (`2026-03-15`) was identified correctly:
- Supabase remote migration history is not in a safe apply state for this sweep
- remote is ahead of local with:
  - `20260312110000`
  - `20260312123000`
- local is ahead of remote with:
  - `20260314183000_youtube_transcript_cache_v1.sql`
  - `20260314203000_retire_yt_to_text_legacy_state.sql`
- do not run blind `npx supabase db push` until the repo/remote migration history is reconciled
b6) [have] Supabase migration history is now reconciled locally:
- recovered the missing remote-only migrations into `supabase/migrations/`
  - `20260312110000_transcript_requests_v1.sql`
  - `20260312123000_transcript_requests_result_ingest_v1.sql`
- `npx supabase migration list` now shows those two versions on both local and remote
- only the intended launch migrations remain local-only:
  - `20260314183000_youtube_transcript_cache_v1.sql`
  - `20260314203000_retire_yt_to_text_legacy_state.sql`

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

d2) [have] Step 2: push and CI confirmation
- push the current repo state
- wait for CI to pass on the pushed commit
- do not continue if CI is red
- sweep result (`2026-03-15`):
  - pushed release-prep commit `d1a2e6d9000e7df057b92341658798c601069042` to `origin/main`
  - first CI run failed before Typecheck executed because `scripts/with-node20.sh` was committed without the executable bit (`exit code 126`)
  - fixed forward with commit `86aa652d5a5a53271282abeb52bd62926227cc77` (`Fix CI executable bit for node20 wrapper`)
  - pushed `86aa652d5a5a53271282abeb52bd62926227cc77` to `origin/main`
  - CI Gate run `23105227966` completed `success`

d3) [have] Step 3: apply the additive migration first
- apply `supabase/migrations/20260314183000_youtube_transcript_cache_v1.sql`
- verify remote migration watermark
- verify `youtube_transcript_cache` exists before moving on
- sweep result (`2026-03-15`):
  - blocked before apply
  - `npx supabase migration list` showed remote-ahead drift (`20260312110000`, `20260312123000`) that is not present in this repo
  - safe decision: stop before any apply command instead of risking mixed migration history
- reconciliation result (`2026-03-15`):
  - recovered `20260312110000_transcript_requests_v1.sql` and `20260312123000_transcript_requests_result_ingest_v1.sql` from remote migration history via `npx supabase migration fetch --linked`
  - reverted the fetch-induced whitespace churn in older migration files and kept only the two real additions
  - `npx supabase migration list` now shows the remote-only drift resolved
  - Step 3 can resume from a clean migration-history baseline
- apply result (`2026-03-15`):
  - applied `supabase/migrations/20260314183000_youtube_transcript_cache_v1.sql` directly with `psql` against the linked Supabase database
  - recorded version `20260314183000` as applied via `npx supabase migration repair --status applied 20260314183000 --linked --yes`
  - verified `npx supabase migration list` now shows `20260314183000` on both local and remote
  - verified only `20260314203000_retire_yt_to_text_legacy_state.sql` remains local-only

d4) [have] Step 4: verify behavior before cleanup migration
- run one safe backend/app smoke after the additive migration
- confirm normal app boot and transcript fetch behavior still look correct
- stop here if the additive migration introduces unexpected behavior
- sweep result (`2026-03-15`):
  - verified `public.youtube_transcript_cache` exists with the expected columns:
    - `video_id`
    - `transcript_text`
    - `transcript_source`
    - `confidence`
    - `segments_json`
    - `provider_id`
    - `transport_json`
    - `provider_trace_json`
    - `created_at`
    - `updated_at`
  - verified local backend health by starting the server once through the Node 20 wrapper and hitting `/api/health`
  - `GET /api/health` returned `{"ok":true}`

d5) [todo] Step 5: apply the legacy cleanup migration second
- apply `supabase/migrations/20260314203000_retire_yt_to_text_legacy_state.sql`
- verify migration watermark and one post-apply DB sanity check
- treat this as the cautious step because it deletes legacy rows
- sweep result (`2026-03-15`):
  - pre-apply DB sanity check found `0` `provider_circuit_state` rows for `transcript:yt_to_text`
  - pre-apply DB sanity check found `0` `youtube_transcript_cache` rows tied to `yt_to_text`
  - applied `supabase/migrations/20260314203000_retire_yt_to_text_legacy_state.sql` directly with `psql`
  - migration output was `DELETE 0` and `DELETE 0`
  - recorded version `20260314203000` as applied via `npx supabase migration repair --status applied 20260314203000 --linked --yes`
  - verified `npx supabase migration list` now shows local and remote fully aligned through `20260314203000`
  - post-apply DB sanity check still shows `0` legacy `yt_to_text` circuit rows and `0` legacy `yt_to_text` transcript-cache rows

d6) [have] Step 6: deploy backend/frontend
- deploy the same commit that passed CI
- restart/reload services through the normal deploy path
- keep deploy and DB rollout tied to the same release window
- sweep result (`2026-03-15`):
  - committed and pushed rollout state as `11bc2e830122524c28e4d2864462a074bc9765b7` (`Record transcript launch migration rollout`)
  - CI Gate run for `11bc2e8` completed `success`
  - no frontend asset changes were part of this rollout commit, so the live deploy step was backend-only
  - Oracle checkout at `/home/ubuntu/remix-of-stackwise-advisor` had drifted (`ahead 1, behind 4`) with tracked local edits from the abandoned Oracle/Paperspace cutover
  - reset tracked Oracle repo state to `origin/main` at `11bc2e830122524c28e4d2864462a074bc9765b7` while preserving untracked `transcribe-queue/`
  - restarted `agentic-backend.service`
  - service is active on the Node 20 ExecStart path

d7) [todo] Step 7: run post-deploy proof checks
- verify `/api/health`
- verify one normal authenticated app flow
- run one real `/api/youtube-to-blueprint` smoke if upstream provider conditions allow it
- confirm transcript-provider metadata reflects the current runtime path
- sweep result (`2026-03-15`):
  - deployed health checks passed:
    - Oracle local `GET /api/health` -> `{"ok":true}`
    - public `https://api.bleup.app/api/health` -> `{"ok":true}`
  - `npm run smoke:release -- --api-base-url https://api.bleup.app --json` passed
  - deployed YT2BP smoke was mixed:
    - `success|https://www.youtube.com/watch?v=ojAjUKcx7p4` -> `504 TIMEOUT` after `60735ms`
    - `expected_fail|https://www.youtube.com/watch?v=4q_b6Otq3aU` -> `200 ok=true`
    - `edge|https://www.youtube.com/watch?v=CSgjaC6y6Mk` -> `200 ok=true`
  - direct deployed verification on `https://www.youtube.com/watch?v=CSgjaC6y6Mk` returned:
    - `status=200`
    - `ok=true`
    - `meta.transcript_transport.provider='videotranscriber_temp'`
    - `meta.transcript_source='videotranscriber_temp'`
  - proof boundary is therefore good enough to confirm deploy + current transcript-provider path, but the full smoke matrix is not fully green yet because the temporary provider remains variable

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
