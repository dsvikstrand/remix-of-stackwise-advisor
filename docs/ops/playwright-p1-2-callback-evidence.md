# Playwright P1-2 Callback Evidence

Status: `supporting-evidence`

## Doc Role
a0) [have] This is supporting automation evidence for `P1-2`, not a primary planning surface.
a00) [have] Launch status still lives in `docs/ops/mvp-launch-readiness-checklist.md`.
a000) [have] Active proof-only sequencing now lives in `docs/exec-plans/active/tail/mvp-launch-proof-tail.md`, while the completed implementation program lives in `docs/exec-plans/completed/mvp-readiness-review-followup.md`.

## Goal
a1) [todo] Use Playwright to capture repeatable callback-path evidence for `P1-2` before final real-device signoff.

## Scope
b1) [have] This suite targets the deployed frontend at `https://dsvikstrand.github.io/remix-of-stackwise-advisor/`.
b2) [have] The required automated path is `/subscriptions`.
b3) [have] The `/welcome` flow is best-effort and may be skipped when the test account is not in a stable onboarding-visible state.
b4) [todo] This suite does not replace the final real-device Safari/Chrome pass.

## Harness
c1) [have] Playwright config: `playwright.p1-oauth.config.ts`
c2) [have] Command:
- `npm run test:playwright:p1-oauth`

c3) [have] Test file:
- `tests/playwright/p1-oauth.spec.ts`

c4) [have] Artifact behavior:
- screenshots and JSON evidence are attached per test in `test-results/`
- HTML report is emitted to `playwright-report/p1-oauth/`

## Automated Coverage
d1) [have] iPhone-emulated `/subscriptions` connect start:
- verifies authenticated page load
- verifies `POST /api/youtube/connection/start`
- verifies redirect attempt to Google OAuth

d2) [have] iPhone-emulated `/subscriptions` callback success:
- verifies route stays on `/subscriptions`
- verifies `yt_connect` params are cleared
- verifies success toast is visible

d3) [have] iPhone-emulated `/subscriptions` callback error:
- verifies route stays on `/subscriptions`
- verifies callback params are cleared
- verifies failure toast is visible

d4) [have] Android-emulated `/subscriptions` connect start:
- same assertions as iPhone connect start

d5) [have] Android-emulated `/subscriptions` callback success:
- same assertions as iPhone callback success

d6) [have] Android-emulated `/welcome` callback best-effort:
- runs only if the account is still in a stable onboarding-visible state
- otherwise records a structured skip rather than a misleading failure

## Execution Result
e1) [have] Suite command:
- `npm run test:playwright:p1-oauth`

e2) [have] Result:
- `6` passed
- `1` skipped
- runtime `44.1s`

e3) [have] Confirmed automated evidence:
- iPhone-emulated `/subscriptions` connect start returned `200` from `/api/youtube/connection/start` and produced a Google OAuth redirect attempt
- iPhone-emulated `/subscriptions?yt_connect=success` returned to `/subscriptions`, cleared callback params, and showed `YouTube connected`
- iPhone-emulated `/subscriptions?yt_connect=error&yt_code=access_denied` returned to `/subscriptions`, cleared callback params, and showed `YouTube connect failed`
- Android-emulated `/subscriptions` connect start returned `200` from `/api/youtube/connection/start`; Chromium mobile emulation did not expose the external redirect attempt in the same way as iPhone emulation, but the backend-start evidence was captured
- Android-emulated `/subscriptions?yt_connect=success` returned to `/subscriptions`, cleared callback params, and showed `YouTube connected`

e4) [have] Welcome flow outcome:
- `/welcome` was skipped by design because this account is not in a stable onboarding-visible state for deterministic automation
- the suite records that as a structured skip instead of a misleading failure

e5) [have] Artifact summary:
- per-test JSON evidence attachments are emitted under `test-results/`
- screenshots are emitted for the connect/callback evidence cases
- HTML report is emitted to `playwright-report/p1-oauth/`

e6) [todo] Remaining gap:
- real iPhone Safari and Android Chrome callback runs are still needed for final checklist signoff

## Final Signoff Boundary
f1) [have] This suite is strong automation evidence for callback routing, query-param cleanup, and OAuth-start behavior.
f2) [todo] Final launch signoff still requires at least:
- one real iPhone Safari pass
- one real Android Chrome pass

## Handoff To Manual Signoff
g1) [have] The automated suite reduces the real-device task to four quick checks:
- iPhone Safari success on `/subscriptions`
- iPhone Safari error on `/subscriptions`
- Android Chrome success on `/subscriptions`
- Android Chrome error on `/subscriptions`

g2) [have] Use `docs/ops/p1-1-p1-2-verification-runbook.md` for the exact manual checklist and evidence fields.
