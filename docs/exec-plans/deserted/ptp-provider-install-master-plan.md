# PTP Provider Install Master Plan

Status: `deserted`

Deserted note
a0) [have] This plan was deserted on `2026-03-15` after the `PTP` direction was abandoned.
a00) [have] Preserve for history only; do not resume without a new explicit replacement plan.

## Goal
a1) [todo] Install `PTP` as a transcript-provider-compatible boundary before touching the main Bleu app flow, so the eventual `videotranscriber_temp -> ptp` swap is small, controlled, and easy to verify.

## Current Baseline
b1) [have] Current GitHub baseline uses `videotranscriber_temp` as the repo/dev default transcript provider, with `youtube_timedtext` as the built-in direct fallback.
b2) [have] The existing Bleu pipeline already expects a provider-like contract: request transcript, wait, receive transcript or provider error, continue into the normal generation path.
b3) [have] The current runtime docs remain correct and must stay unchanged during this plan because `PTP` is not live runtime truth yet.

## Install Strategy
c1) [todo] Phase 1: build a standalone `PTP` compatibility API in isolation.
- Treat `adding a job to inbox/` as the internal equivalent of calling a transcript API.
- Keep the app-facing contract provider-shaped:
  - input: normalized YouTube `video_id` (URL allowed only if it is normalized to `video_id` at the API boundary)
  - output: concatenated transcript text, optional segments, provider/source label
- Internal provider behavior:
  - submit a new Oracle job when no matching active job exists
  - reuse an existing matching job when the same `video_id` is already in `inbox/` or `processing/`
  - wait for `complete/` or `fail/`
  - ignore extra `PTP` metadata at the Bleu boundary for now

c2) [todo] Phase 2: validate the `PTP` API fully in isolation before touching Bleu.
- Required isolated checks:
  - short-video success
  - long-video segmented success
  - duplicate request reuses active job
  - queue-full returns retryable provider error
  - failed job returns transcript-provider-style failure
  - timeout behavior is explicit and acceptable for MVP

c3) [todo] Phase 3: only after isolated validation passes, add `ptp` as a transcript provider inside Bleu.
- Keep the rest of the app flow unchanged.
- Keep current Bleu-side transcript postprocessing/pruning in place for the first install.
- Do not introduce app-wide async state-machine changes for this install path.

c4) [todo] Phase 4: validate the local app path after provider swap.
- `ptp` transcript reaches the current OpenAI generation path
- deterministic-only generation remains usable with `YT2BP_QUALITY_ENABLED=false`
- one real `PTP complete -> completed blueprint` pass succeeds locally

c5) [todo] Phase 5: only after local app validation passes, promote `ptp` toward live use.
- make `ptp` the default provider
- keep `youtube_timedtext` only as temporary rollback if still needed
- remove or replace temporary fallback paths later in a separate cleanup step, not during the initial install

## Compatibility API Contract
d1) [todo] The `PTP` compatibility API must look like a normal transcript provider from Bleu’s perspective.
- request input is normalized to `video_id`
- successful response returns one final concatenated transcript text plus minimal provider/source fields
- failed response returns a transcript-provider-style error that the caller can retry or surface normally

d2) [todo] Queue control rules for MVP:
- dedupe key is normalized `video_id`
- active-job lookup spans both `inbox/` and `processing/`
- queue cap counts `inbox/` plus `processing/`
- if queue cap is exceeded, return a retryable provider error

d3) [todo] Timeout/default wait rules for MVP:
- synchronous wait is acceptable for the compatibility API
- target wait budget is `300s`
- polling is acceptable while traffic is low
- later scale work can move to a different async model if needed

## Tracking And Acceptance
e1) [todo] This plan is complete only when all of these are true:
- isolated `PTP` compatibility API exists
- all isolated API scenarios pass
- Bleu can call `ptp` as a provider without unrelated app-flow changes
- one local `PTP complete -> completed blueprint` pass succeeds
- live runtime docs are updated only after one live pass succeeds

e2) [todo] Anti-circle rule for this install:
- each phase must have one stable acceptance boundary
- failures stay inside the validation playbook until the same scenario reproduces twice
- no new blocker tracker is created for one-off setup noise or executor availability

e3) [todo] The paired validation source of truth for this plan is:
- `docs/exec-plans/deserted/ptp-provider-validation-playbook.md`

## Rules
f1) [have] This plan is docs-only for now.
f2) [todo] Do not update `docs/architecture.md`, `docs/ops/yt2bp_runbook.md`, or other runtime-truth docs until isolated `PTP` validation is complete.
f3) [todo] Do not change Bleu code until Phase 1 and Phase 2 are both complete.

## Assumptions
g1) [have] `PTP` should be treated as a provider adapter, not as a new app-wide async state machine.
g2) [have] Longer waits are acceptable for MVP if the provider contract stays simple.
g3) [have] Existing Bleu-side transcript pruning remains in place for the first install even if `PTP` already performs segmentation and concat internally.
g4) [have] Extra `PTP` metadata is intentionally ignored at the Bleu boundary for the first install.
