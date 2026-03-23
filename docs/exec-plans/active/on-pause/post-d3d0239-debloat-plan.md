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

g2) [todo] Phase 1: build and lock the simplification cut.
- evaluate:
  - `jobId` plumbing into `createBlueprintFromVideo(...)`
  - stale variant recovery in `blueprintVariants.ts`
  - ingestion-job lookup inside variant resolution
  - `persistTerminalGenerationRun(...)` in `youtubeBlueprintPipeline.ts`
  - tests/docs that only support logic we no longer want

g21) [todo] Phase 1 should narrow to one concrete cleanup decision:
- either keep the stale-recovery branch as-is because it is still proven necessary
- or remove/simplify that branch while preserving:
  - `jobId` ownership
  - terminal `generation_runs` persistence

g3) [todo] Phase 2: implement the smallest forward cleanup on `main`.
- keep any proven app-correctness path
- remove speculative recovery machinery first
- avoid broad revert unless the entire commit is clearly net-negative

g4) [todo] Phase 3: verify cleanup against current app behavior.
- successful blueprint generation still publishes normally
- failed transcript/provider runs still fail cleanly
- no new stuck `running` state appears
- queue/Wall truth remains unchanged apart from simpler internal code paths

## Success Criteria
h1) [todo] The repo gets simpler after cleanup.

h2) [todo] The app keeps only the minimum logic needed for real app correctness.

h3) [todo] Provider-side problems are no longer being “solved” by speculative app-side hardening.

h4) [todo] After this plan, provider investigation can proceed as a separate track with a cleaner baseline.
