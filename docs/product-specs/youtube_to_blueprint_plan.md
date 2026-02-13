# YouTube To Blueprint MVP Plan

## Status
a1) [have] Clear wedge: `YouTube URL -> editable blueprint draft`.
a2) [have] Strict MVP path is implemented for single-video YouTube flows.
a3) [have] Real endpoint is live: `POST /api/youtube-to-blueprint`.
a4) [have] Public route and nav entry are live at `/youtube`.
a5) [have] Focused YT2BP pilot completed and reviewed.
a6) [have] YT2BP quality gate (LLM grading, min-score, retry) is wired server-side.
a7) [have] YT2BP content safety gate (LLM grading + one retry) is wired server-side.
a8) [todo] `instruction_security` gate is documented but not runtime-wired.
a9) [have] 2026-02-12 UI note: feed text hygiene updates in Project 2 Step 1 are frontend-only and do not change YT2BP API/runtime contract.
a10) [have] 2026-02-12 UI note: feed row-shell updates in Project 2 Step 2 are frontend-only and do not change YT2BP API/runtime contract.
a11) [have] 2026-02-12 UI note: one-row full-tag rendering updates in Wall/Explore are frontend-only and do not change YT2BP API/runtime contract.
a12) [have] 2026-02-12 UI hotfix: one-row tag width measurement fix (mobile visibility) is frontend-only and does not change YT2BP API/runtime contract.
a13) [have] 2026-02-13 UI note: Project 2 Step 3 wall-to-wall row tightening + comments counter in Wall/Explore are frontend-only and do not change YT2BP API/runtime contract.
a14) [have] 2026-02-13 UI hotfix: Explore card tag clicks now trigger tag search reliably (without forcing channel join); frontend-only and does not change YT2BP API/runtime contract.
a15) [have] 2026-02-13 UI note: Project 3 Step 1 join-state wiring (Explore/Channels/Wall) and filter-only `TagFilterChips` are frontend-only and do not change YT2BP API/runtime contract.

## 4-Step Plan
b1) [todo] Lock MVP contract
- Input: one YouTube single-clip URL.
- Output: one editable blueprint draft (timestamps when available).
- If extraction cannot complete: show a simple error and stop.
- Out of scope: playlists, multi-video merge, social automation.

b2) [todo] Implement transcript ingestion behind one adapter
- Create one internal interface: `getTranscript(url)`.
- Start with a duct-tape provider for speed.
- Keep provider details isolated so paid API swap is minimal later.

b3) [todo] Implement draft generation + evaluation gates
- Convert transcript into ordered steps and cautions.
- Run minimal gates before publish: structural, safety, PII.
- Surface clear fail/warn reasons in UI.

b4) [todo] Validate with a focused pilot
- Run a small video set and track: transcript success, draft quality, publish rate, edit rate.
- Keep/kill thresholds explicit before expanding scope.

## Exit Criteria
c1) [have] Users can generate and publish a usable draft in one session.
c2) [have] Transcript retrieval is working with provider abstraction.
c3) [todo] Reliability must be validated on a focused pilot set.

## Q & A

a1) Product scope
- Blueprint-first product direction.
- Shift emphasis from `library -> blueprint` to `create blueprint from source`.
- Primary flow: `Create Blueprint -> Select Source`.
- Initial source list: `template` (new), `library`, `youtube`.

a2) Input constraints (MVP)
- Accept single-clip YouTube videos only.
- Reject playlists in MVP.

a3) Output contract (MVP)
- Minimum: at least 1 step.
- If no actionable guide is present, return a short video summary as fallback output.
- Keep this as a temporary policy for MVP speed.

a4) Review gate UX
- Allow post-edits before publish (and after, where current app policy allows).
- Keep user editing in the normal publish flow.

a5) Failure UX
- For now use a simple failure message:
- `Could not complete the blueprint. Please test another video.`
- For transcript-unavailable cases:
- `Transcript unavailable for this video. Please try another video.`
- Keep fallback/advanced recovery for later iteration.

a6) Attribution rule
- Skip explicit source attribution in published blueprint for v1.
- Treat source attribution as a later option/setting.

a7) Quality floor
- Use golden draft/eval baselines.
- If generated output meets baseline quality, treat as pass.

a8) Time budget
- Use progress feedback (progress bar/status).
- Allow longer timeout for MVP (`up to ~2 minutes`).

a9) Safety policy
- Treat safety as an eval stage in the pipeline.
- Current policy blocks forbidden topics in generated output:
- `self_harm`, `sexual_minors`, `hate_harassment`.

a10) PII policy
- PII eval is wired and enforced in generation pipeline.
- Current high-signal patterns: `email`, `phone`, `ssn`.

a11) Domain focus
- Start general-first (global criteria).
- Add domain-specific criteria only where clearly needed.

a12) Libraries in product structure
- Libraries remain available but de-emphasized.
- Product focus is `Explore Blueprints` + `Create Blueprint`.
- On create, user selects source and enters source-specific builder flow.

a13) MVP success metrics
- Completion rate.
- Sign-ups (optionally allow one non-signup trial run with nudge to register).

a14) Pivot trigger for paid transcript API
- If early MVP signal is positive, move from duct-tape transcript source to paid API.

### Temporary MVP Policies
b1) [have] Keep `single-video only` policy until transcript reliability is validated.
b2) [have] Keep `1-step minimum or summary fallback` until richer extraction is tuned.
b3) [have] Keep simple failure messaging first; enhance recovery flows later.
b4) [have] Safety/PII are wired with baseline enforcement; tune later as needed.

### Open Decisions (Later)
c1) [todo] Add optional source attribution in published blueprints.
c2) [todo] Define final safety/PII blocking behavior per mode (`seed` vs `user`).
c3) [todo] Decide whether non-signup trial is one-time or rate-limited.
c4) [todo] Decide first paid transcript provider after MVP signal.
c5) [todo] Implement runtime `llm_instruction_security_v0` (prompt injection / jailbreak checks).


## Full Implementation Plan (4-Steps)

### Step 1 - Ship the Simple YT2BP Entry
d1) [have] Add nav entry: `YouTube`.
d2) [have] Keep the page minimal:
- One URL input.
- One primary action: `Generate Blueprint`.
- Two optional toggles:
- `Generate AI review`
- `Generate banner`
d3) [have] No source customization and no edit-mode branch in v1.
d4) [have] Same-page preview is implemented.
d5) [have] Logged-out users can preview and are prompted to log in to publish.

### Step 2 - Build the Core Pipeline (URL -> Blueprint)
e1) [have] Transcript ingestion is behind one adapter:
- `getTranscript(videoUrl) -> { text, segments?, source, confidence }`.
e2) [have] Duct-tape transcript retrieval is active for MVP (`yt_to_text` provider), isolated behind the adapter.
e3) [have] Transform transcript directly into a blueprint draft:
- Title.
- Ordered steps.
- Optional timestamps.
- Optional notes/cautions.
e4) [have] If no actionable steps are found, fallback behavior is handled in generation.
e5) [have] Provider switch exists via env (`TRANSCRIPT_PROVIDER`).

### Step 3 - Add Guardrails + User-Facing Failure Handling
f1) [have] Run baseline eval gates before allowing publish-ready output:
- Structural.
- Safety baseline enforcement (deterministic + `llm_content_safety_grading_v0`).
- PII baseline enforcement.
f1b) [have] YT2BP quality grading gate enforces 5 criteria with retry (`K=2`) and hard-fail fallback.
f2) [have] If generation fails, show simple UX message:
- `Could not complete the blueprint. Please test another video.`
f3) [have] Keep logs for:
- transcript source and confidence
- gate results
- final generation status
f4) [have] Loading UI includes progress bar + staged text updates.

### Step 4 - Validate the MVP and Prepare Phase 2
g1) [todo] Pilot with selected single videos and measure:
- completion rate
- draft success rate
- publish rate
- edit-before-publish rate
g2) [todo] Decide continue/pivot:
- if signal is strong, move to paid transcript provider
- if weak, tune extraction quality before wider rollout
g3) [todo] Phase 2 (deferred):
- `Open in edit mode` path
- optional temporary library creation from video items
- migration to the broader `Create Blueprint -> Select Source` UX

### Implementation Checklist
h1) [have] Product contract and flow signed off for MVP scope.
h2) [have] Adapter contract implemented and tested.
h3) [have] Duct-tape transcript source integrated behind adapter.
h4) [have] Simple extraction failure UX is implemented (clear message + retry another video).
h5) [have] Draft generation produces valid blueprint payload.
h6) [have] Structural + safety + PII gates run before publish.
h7) [have] Telemetry events and failure reasons are logged.
h8) [have] Pilot run completed and reviewed against thresholds.

## Pilot Summary (2026-02-12)
i1) Outcomes
- Baseline phase A (10/10 URLs, review/banner off): 10 successes, 0 failures.
- Review spot-check phase B (3 URLs): 3 successes.
- Banner spot-check phase C (3 URLs): 3 successes.
- Transcript source was consistently `yt_to_text_subtitles_v1`.

i2) Top failure causes
- None in this run set (`top_error_codes: []`).

i3) Decision
- GO
- Baseline thresholds passed:
  - generation success rate: `100%` (target `>= 75%`)
  - median duration: `7829ms` (target `<= 60000ms`)
  - p95 duration: `9160ms` (target `<= 120000ms`)

i4) Immediate next action
- Run a small UI-inclusive publish-path pilot to measure true `publish_rate` and `edit-before-publish` behavior (not captured by API-only pilot calls).

## v0 Operational Lock-In (2026-02-12)
j1) [have] Reproducible post-deploy smoke added:
- `npm run smoke:yt2bp -- --base-url https://bapi.vdsai.cloud`
- source list: `docs/app/yt2bp_smoke_urls.txt`
j2) [have] Logs-first metrics parser added:
- `npm run metrics:yt2bp -- --source journalctl --json`
j3) [have] Runbook added:
- `docs/ops/yt2bp_runbook.md`
j4) [have] Frozen API contract added:
- `docs/product-specs/yt2bp_v0_contract.md`
j5) [have] Endpoint kill switch added:
- `YT2BP_ENABLED=true|false`
