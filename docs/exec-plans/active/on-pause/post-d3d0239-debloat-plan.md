# Post-d3d0239 Debloat Plan

Status: `on-pause`

## Pause Note
a0) [have] This plan is intentionally stored as an on-pause reference plan because the repo already has one active implementation root in [backend-write-policy-plan.md](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/docs/exec-plans/active/backend-write-policy-plan.md).

a1) [have] This plan should be resumed only as a narrow debloat pass.

a2) [have] This plan is explicitly separate from any transcript-provider investigation or provider-remediation work.

## Goal
b1) [todo] Debloat the post-`d3d0239` change stack by removing or simplifying speculative app-side hardening that was added while reacting to an upstream transcript/provider problem.

b2) [todo] Preserve valid app-scope fixes while shrinking or removing changes that are not proven necessary for current app correctness.

## Why This Exists
c1) [have] The current evidence points to a real transcript/provider reliability problem plus an app visibility problem, not a broad silent Wall-publish failure.

c2) [have] `d3d0239` itself is not a strong code-path match for the current queue-result symptom.

c3) [have] The strongest debloat candidate in the post-`d3d0239` stack is `13cb75b` `Recover stale source generation state`.

c4) [have] The likely keep set is:
- `1e4ffde` `Fix PWA update refresh dismissal`
- `ee76f44` `Fix pipeline summary helper import`
- `19205c2` `Bypass transcript throttle on cache hits` for now

## Scope Lock
d1) [todo] Keep this plan focused on debloating the post-`d3d0239` app-side reaction work.

d2) [todo] Do not widen this plan into provider diagnosis, provider replacement, or transcript-availability mitigation strategy.

d3) [todo] Prefer forward simplification on `main` over broad rollback.

d4) [todo] Do not add new functionality in this plan.

## Audit Target
e1) [have] Primary audit target:
- `13cb75b` `Recover stale source generation state`

e2) [have] Files/functions introduced or materially expanded by that commit:
- [server/services/blueprintVariants.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/blueprintVariants.ts)
- [server/services/blueprintCreation.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/blueprintCreation.ts)
- [server/services/youtubeBlueprintPipeline.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/youtubeBlueprintPipeline.ts)
- [server/index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)

e3) [have] Current preliminary read:
- `13cb75b` is the strongest overreach candidate
- `19205c2` is still a plausible app-scope optimization because it avoids unnecessary throttle delay on cache hits
- `1e4ffde` and `ee76f44` are independent, small, and should stay

## Debloat Rules
f1) [todo] For each behavior added after `d3d0239`, ask:
- does this solve an app-scope problem the app actually owns?
- is it still needed under the current bounded evidence?
- can the same outcome be achieved by simplifying existing code instead of keeping the added machinery?

f2) [todo] If a behavior is not clearly needed, prefer:
- remove
- simplify
- inline back into existing logic

f3) [todo] Do not keep recovery/state machinery just because it exists.

f4) [todo] Do not revert small clearly valid fixes together with larger speculative ones.

## Phases
g1) [have] Phase 0: isolate the exact surfaces added by `13cb75b`.
- list each behavior added by the commit
- map each behavior to the symptom it was intended to solve
- classify each one as:
  - app-scope fix
  - provider-chasing hardening
  - unclear / not yet proven

g01) [have] Phase 0 audit result:

| behavior unit | why it was added | current evidence | recommendation | confidence |
| --- | --- | --- | --- | --- |
| pass `jobId` into `createBlueprintFromVideo(...)` and `claimVariantForGeneration(...)` | record job ownership on `source_item_blueprint_variants.active_job_id` and avoid blind in-progress state | current running variants are actively using `active_job_id`; this is a small ownership/traceability refinement and not tied to provider outages | `[keep]` | `high` |
| `persistTerminalGenerationRun(...)` wrapper in `youtubeBlueprintPipeline.ts` | persist terminal `generation_runs` state even when trace-event writes fail | this is app-scope correctness; it isolates terminal run persistence from best-effort trace logging and is not provider-chasing | `[keep]` | `medium-high` |
| stale variant recovery in `blueprintVariants.ts` (`getIngestionJob(...)`, `maybeRecoverStaleInProgressVariant(...)`, `markVariantRecoveredFromStale(...)`) | recover queued/running variants that appear stale or orphaned | current bounded sample does not prove stale variants as the dominant live issue; the visible `STALE_VARIANT_RECOVERED` rows look tied to a one-time repair wave rather than the ongoing runtime helper, because their stored message text does not match the helper’s runtime message format | `[simplify]` | `medium` |
| ingestion-job lookup inside hot-path variant resolution | support the stale-variant recovery path by inspecting job status/lease | useful only if the stale-recovery path stays; otherwise it is extra DB lookups and complexity in the hot path | `[remove if stale recovery is removed]` | `medium` |
| tests/docs added only to support stale-recovery machinery | cover the larger stale-recovery hardening | keep only if the corresponding runtime logic stays | `[remove with stale-recovery cleanup]` | `medium` |

g02) [have] Phase 0 live-data notes:
- recent `generation_runs` are dominated by `PROVIDER_FAIL`, `TIMEOUT`, and normal success, not by silent publish misses
- the visible `STALE_RUN_RECOVERED` and `STALE_VARIANT_RECOVERED` rows cluster around one recovery moment rather than appearing as an ongoing dominant runtime pattern
- the current production symptom remains:
  - transcript/provider instability
  - plus hidden failure visibility in the app
  not
  - a proven broad stale-state publish-path failure

g03) [have] Phase 0 decision:
- do not broad-revert the post-`d3d0239` stack
- keep the small app-scope fixes
- treat the stale-recovery branch in `blueprintVariants.ts` as the main simplification candidate for Phase 1
- keep provider investigation as a separate later plan

g2) [have] Phase 1: build and lock the simplification cut.
- evaluate:
  - `jobId` plumbing into `createBlueprintFromVideo(...)`
  - stale variant recovery in `blueprintVariants.ts`
  - ingestion-job lookup inside variant resolution
  - `persistTerminalGenerationRun(...)` in `youtubeBlueprintPipeline.ts`
  - tests/docs that only support logic we no longer want

g21) [have] Phase 1 locked decision:
- do not remove stale recovery entirely
- keep only the smallest reclaim rule that is still supported by live evidence:
  - reclaim stale `queued` / `running` variants only when they are older than the threshold and `active_job_id` is missing
- remove the heavier ingestion-job / lease / status lookup heuristics
- keep:
  - `jobId` ownership plumbing
  - terminal `generation_runs` persistence

g22) [have] Phase 1 execution structure:
- inspect only the stale-recovery branch in [blueprintVariants.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/blueprintVariants.ts)
- compare two cleanup options:
  - `Option A`: remove stale-recovery logic entirely and keep only the smaller `jobId` ownership path
  - `Option B`: keep a much smaller reclaim rule, but remove ingestion-job/lease heuristics and extra hot-path DB lookup
- decision:
  - `Option B`

g23) [have] Phase 1 decision questions:
- does current production correctness still depend on runtime stale-variant recovery?
- is the current stale-recovery branch fixing an ongoing app problem, or mainly preserving a one-time repair pattern?
- if stale recovery is removed, do `jobId` ownership and terminal `generation_runs` persistence still cover the proven app-scope correctness needs?

g231) [have] Phase 1 answer summary:
- fully removing stale recovery is too aggressive right now because there are still live stale `running` variants with `active_job_id = null`
- the ingestion-job lookup path is not justified by the current bounded evidence
- the smallest defensible cut is to keep missing-`active_job_id` reclaim only

g24) [have] Phase 1 scope lock:
- no provider fixes
- no frontend changes
- no broad revert
- no changes to [server/services/transcriptFetchWithCacheBypass.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/transcriptFetchWithCacheBypass.ts)
- no changes to [src/components/pwa/BleupPwaRuntime.tsx](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/components/pwa/BleupPwaRuntime.tsx)
- no changes outside the `13cb75b` cleanup target set unless the decision lock proves they are required for a coherent simplification

g25) [have] Phase 1 expected output:
- one locked keep/remove table for:
  - `jobId` plumbing
  - stale variant recovery helpers
  - ingestion-job lookup in variant resolution
  - `persistTerminalGenerationRun(...)`
  - supporting tests
- one exact Phase 2 implementation contract naming the files/functions allowed to change
- one explicit non-goal list for the cleanup pass

g26) [have] Phase 1 acceptance criteria:
- the cleanup target is reduced to one concrete implementation choice
- the chosen Phase 2 cut removes or simplifies code rather than adding more
- the decision is justified by current evidence, not by provider-outage speculation

g3) [have] Phase 2: implement the smallest forward cleanup on `main`.
- keep any proven app-correctness path
- remove speculative recovery machinery first
- avoid broad revert unless the entire commit is clearly net-negative

g31) [have] Phase 2 progress note:
- removed the ingestion-job lookup / lease heuristic branch from [blueprintVariants.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/blueprintVariants.ts)
- kept only the smaller reclaim rule for stale `queued` / `running` variants that have no `active_job_id`
- preserved:
  - `jobId` ownership plumbing
  - same-job no-block behavior
  - terminal `generation_runs` persistence in [youtubeBlueprintPipeline.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/youtubeBlueprintPipeline.ts)
- updated focused tests to match the simpler retained behavior

g4) [have] Phase 3: verify cleanup against current app behavior.

g41) [have] Phase 3 proof result: mixed.
- `[have]` Fresh `running` variants are now writing `active_job_id`, and there are no fresh post-cleanup `running` variants with missing `active_job_id` in the bounded check (`updated_at >= 2026-03-23T19:00:00Z`).
- `[have]` Recent `source_page_video_library` failures still look like upstream provider failures, not silent publish misses.
- `[have]` A real publish path still works end to end: the latest checked success `d9068a8b-8ad0-4244-b91c-695deaa0dc03` is `is_public = true` and has a `user_feed_items.state = channel_published` row.
- `[todo]` A separate app-state mismatch is still present after the cleanup: some `source_item_unlock_generation` jobs are finishing `succeeded` with `skipped_count = 1` while leaving both their variant and `generation_run` in `running`.

g42) [have] Phase 3 bounded live sample:
- last `15` `generation_runs` for `source_scope = source_page_video_library`:
  - `8` `running`
  - `7` `failed`
  - `0` fresh terminal success inside that bounded window
- all `7` terminal failures in that bounded window were `PROVIDER_FAIL`

g43) [have] Concrete stale-state examples observed after the cleanup:
- job `c65b2434-0803-4b80-913d-0af64b0a3247` (`What Really Happens to Belly Fat When You Walk on an Empty Stomach (Science Explained)`) finished `succeeded` at `2026-03-23T19:28:34Z` with `inserted_count = 0` and `skipped_count = 1`, but variant `fdcff8cc-fafa-459e-bd5f-5b66970e59ec` is still `running` and generation run `sub-source_page_video_library-1774293902219-wsdz3g` is still `running`
- job `3c78394f-a6c0-473c-8e2c-2d32a598a1b8` (`What Happens to Belly Fat When You Walk Fasted`) finished `succeeded` at `2026-03-23T19:28:03Z` with `inserted_count = 0` and `skipped_count = 1`, but variant `75cdf1b7-b750-4d03-84df-3445fc32186d` is still `running` and generation run `sub-source_page_video_library-1774293708842-4uc56f` is still `running`
- the same post-terminal pattern also appears on other fresh unlock jobs in the same window (`23991961-067c-4e8a-a7dc-17f8adecc1c9`, `90d6b2ec-d28d-4c82-8cbe-8153af810685`, `cdc3e754-6f06-4f3c-b8a2-3d05dda06c5d`, `e777366f-93b5-484c-9345-252915531619`)

g44) [have] Phase 3 conclusion:
- the Phase 2 debloat cut did remove the heavier ingestion-job / lease lookup branch, and the retained `active_job_id` ownership path is working
- but the plan does not close cleanly here, because there is still a real terminal skipped-job stale-state bug in the unlock-generation path
- the next plan should inspect that narrower terminal-skip / same-job state-sync branch directly, rather than reopening provider work or restoring the removed hot-path lookup machinery

## Success Criteria
h1) [todo] The repo gets simpler after cleanup.

h2) [todo] The app keeps only the minimum logic needed for real app correctness.

h3) [todo] Provider-side problems are no longer being “solved” by speculative app-side hardening.

h4) [todo] After this plan, provider investigation can proceed as a separate track with a cleaner baseline.
