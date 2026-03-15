# PTP Provider Validation Playbook

Status: `deserted`

Deserted note
a0) [have] This playbook was deserted on `2026-03-15` with the abandoned `PTP` install track.
a00) [have] Preserve for history only; do not treat it as current runtime or implementation guidance.

## Goal
a1) [todo] Validate the new `PTP` compatibility API in isolation before any Bleu code is changed, then validate the later provider swap with the smallest possible app-surface change.

## Validation Levels
b1) [todo] `verified-isolated`
- the standalone `PTP` API/provider boundary behaves correctly without Bleu integration

b2) [todo] `verified-local-app`
- Bleu can call `ptp` as a provider and complete the existing local app path

b3) [todo] `verified-live`
- the live runtime uses `ptp` successfully and runtime docs can be updated

## Phase 1: Isolated API Validation
c1) [todo] Short-video success
- input: one short video `video_id`
- expected:
  - request returns transcript text
  - one Oracle job is used
  - result comes from `complete/`
- proof bundle:
  - input `video_id`
  - Oracle `job_id`
  - transcript length
  - response status and provider/source label

c2) [todo] Long-video segmented success
- input: one long video `video_id`
- expected:
  - request returns one concatenated transcript text
  - segmentation stays internal to `PTP`
  - app-facing response shape matches short-video success shape
- proof bundle:
  - input `video_id`
  - Oracle `job_id`
  - transcript length
  - any segment count if exposed

c3) [todo] Duplicate request reuse
- scenario:
  - send the same `video_id` twice while the first job is still active
- expected:
  - second request does not create a second active Oracle job
  - second request waits on the same existing job
- proof bundle:
  - both request inputs
  - shared Oracle `job_id`
  - queue state before/after

c4) [todo] Queue-full behavior
- scenario:
  - active queue size (`inbox/` + `processing/`) is already at the configured cap
- expected:
  - request fails fast with a retryable transcript-provider error
  - no new Oracle job is submitted
- proof bundle:
  - queue counts
  - returned error code/message

c5) [todo] Fail-folder behavior
- scenario:
  - `PTP` job lands in `fail/`
- expected:
  - API returns transcript-provider-style failure
  - caller can treat it like a normal provider failure
- proof bundle:
  - Oracle `job_id`
  - returned error code/message
  - fail artifact path

c6) [todo] Timeout behavior
- scenario:
  - request does not reach `complete/` or `fail/` within the wait budget
- expected:
  - API returns explicit timeout provider error
  - later terminal artifact does not invalidate the timeout proof
- proof bundle:
  - input `video_id`
  - wait duration
  - returned timeout error

## Phase 2: Local App Validation
d1) [todo] Provider swap smoke
- expected:
  - Bleu can call `ptp` through the transcript service
  - existing transcript postprocessing/pruning still runs
  - no unrelated flow changes are needed

d2) [todo] Deterministic-only local generation smoke
- expected:
  - `YT2BP_QUALITY_ENABLED=false`
  - transcript from `ptp` reaches OpenAI generation
  - deterministic post-generation gate still runs

d3) [todo] Local completed blueprint proof
- expected:
  - one real `PTP complete -> completed blueprint` pass succeeds locally
- proof bundle:
  - input `video_id`
  - Oracle `job_id`
  - final `blueprint_id`
  - final unlock/job state

## Phase 3: Live Validation
e1) [todo] Live short-video pass
- one live request completes through `ptp`

e2) [todo] Live completed blueprint pass
- one live `PTP complete -> completed blueprint` pass succeeds

e3) [todo] Runtime-doc unlock
- only after live pass succeeds:
  - update runtime-truth docs
  - treat `ptp` as live baseline

## Anti-Circle Rules
f1) [todo] Each scenario must be recorded with one proof bundle:
- request input
- Oracle `job_id`
- queue path used
- final result shape
- transcript length/segments if relevant
- final `blueprint_id` for app-level passes

f2) [todo] Failures stay inside this playbook until the same scenario reproduces twice.

f3) [todo] Do not create a separate blocker tracker for one-off setup noise, queue backpressure noise, or executor availability unless the same validation scenario fails twice with the same symptom.

## Completion Rules
g1) [todo] Phase 1 is complete only when all isolated API scenarios are `verified-isolated`.
g2) [todo] Phase 2 is complete only when the provider swap and one local completed-blueprint pass are `verified-local-app`.
g3) [todo] Phase 3 is complete only when one live pass is `verified-live` and runtime docs are updated afterward.
