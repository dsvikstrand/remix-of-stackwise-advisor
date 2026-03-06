# P1-1 / P1-2 Verification Runbook

Status: `supporting-runbook`

## Doc Role
a0) [have] This is a supporting runbook, not a primary planning surface.
a00) [have] Launch status still lives in `docs/ops/mvp-launch-readiness-checklist.md`.
a000) [have] Active proof-only tail lives in `docs/exec-plans/active/mvp-launch-proof-tail.md`, while the completed hardening program lives in `docs/exec-plans/completed/mvp-readiness-review-followup.md`.

## Goal
a1) [todo] Close the last two pre-launch checklist items:
- `P1-1` branch-protection required-check proof
- `P1-2` mobile OAuth callback matrix

## Current State
b1) [have] CI exists and is already running on `main`.
b2) [have] The repo shell in this environment does not currently have `gh` installed or authenticated GitHub settings access, so branch-protection proof cannot be captured automatically from here.
b3) [have] The YouTube OAuth runtime path is implemented and deployed:
- backend start endpoint: `POST /api/youtube/connection/start`
- backend callback endpoint: `GET /api/youtube/connection/callback`
- frontend callback consumers: `/subscriptions` and `/welcome`

## P1-1 Branch Protection Proof

### What Must Be Proven
c1) [todo] `main` is protected by required status checks, not just by a CI workflow file existing in the repo.

### Required Checks To Confirm
d1) [todo] Required checks include:
- `npm run test`
- `npm run build`
- `npx tsc --noEmit`
- `npm run docs:refresh-check -- --json`
- `npm run docs:link-check`

### Fastest Verification Path
e1) [todo] Open GitHub repo settings for `dsvikstrand/remix-of-stackwise-advisor`.
e2) [todo] Go to `Settings -> Branches` or the active repository ruleset page.
e3) [todo] Confirm the rule applying to `main` requires status checks before merge.
e4) [todo] Capture one screenshot showing the required checks list.
e5) [todo] Create a tiny temporary PR from a throwaway branch and confirm merge is blocked until checks pass.
e6) [todo] Capture one screenshot of the PR showing required checks / blocked merge state.
e7) [todo] Close the test PR if it exists only for verification.
e8) [have] Public preflight already confirms the repo exposes the `CI Gate` workflow and recent successful runs on `main`, so the remaining proof is specifically settings/ruleset + PR merge gating, not workflow existence.

### Evidence Template
f1) [todo] Checklist evidence line should include:
- timestamp
- ruleset / branch protection page used
- required checks confirmed
- PR URL or screenshot reference
- pass/fail conclusion

### Pass Criteria
g1) [todo] `P1-1` is done only when both are true:
- branch/ruleset settings prove required checks are configured
- one PR-level proof shows merge is actually gated

## P1-2 Mobile OAuth Callback Matrix

### What Must Be Proven
h1) [todo] Mobile browsers return the user to the intended app context after YouTube OAuth connect/callback.
h2) [todo] The callback must preserve the intended page context and leave the app with a valid signed-in session.

### Confirmed Runtime Behavior
i1) [have] Backend start flow:
- `/api/youtube/connection/start` requires auth
- validates and normalizes `return_to`
- stores `youtube_oauth_states.return_to`
- returns `auth_url`

i2) [have] Backend callback flow:
- `/api/youtube/connection/callback` is anonymous
- validates/consumes OAuth state
- appends `yt_connect` and optional `yt_code` to the stored `return_to`
- redirects back to the app rather than rendering its own page

i3) [have] Frontend callback handling:
- `/subscriptions` reads `yt_connect` / `yt_code`, shows toast, invalidates connection status query, then removes the params
- `/welcome` does the same and can immediately trigger preview/import on success

### Minimum Device Matrix
j1) [todo] Required browsers/devices:
- iPhone Safari
- Android Chrome

j2) [todo] Nice-to-have follow-up:
- iPhone Chrome
- Android Firefox

### Minimum Flows
k1) [todo] Flow A: Subscriptions connect
- sign in
- open `/subscriptions`
- trigger `Connect YouTube`
- complete Google OAuth
- confirm return to `/subscriptions`
- confirm success or failure toast is shown
- confirm `yt_connect` params are cleared after hydration

k2) [todo] Flow B: Welcome onboarding connect
- sign in
- open `/welcome`
- trigger `Connect YouTube`
- complete Google OAuth
- confirm return to `/welcome`
- confirm success toast is shown
- confirm preview/import state is reachable after callback

k3) [todo] Flow C: Error-path callback
- trigger connect but cancel/deny in Google
- confirm return route is still correct
- confirm destructive toast appears with `yt_code`

### Test Matrix Table
l1) [todo] Record one row per run with:
- date/time
- device
- browser
- flow (`subscriptions` or `welcome`)
- start route
- expected return route
- actual return route
- session present after callback (`yes/no`)
- success toast shown (`yes/no`)
- params cleared after load (`yes/no`)
- notes / failure code

### High-Value Failure Checks
m1) [todo] Watch for:
- redirect to domain root instead of app subpath
- callback returns to wrong route
- session not hydrated after callback
- `yt_connect` params remain stuck in the URL
- mobile tab/app switch drops the callback state

### Optional API Preflight Before Device Testing
n1) [todo] Use a fresh bearer token and confirm:
- `GET /api/youtube/connection/status`
- `POST /api/youtube/connection/start` with `return_to` from `/subscriptions`
- `POST /api/youtube/connection/start` with `return_to` from `/welcome`

n2) [todo] Pass criteria for API preflight:
- start endpoint returns `auth_url`
- `return_to` is accepted
- no `YT_RETURN_TO_INVALID` for normal app routes

### Evidence Template
o1) [todo] Checklist evidence line should include:
- timestamp
- device/browser matrix summary
- pass/fail counts
- any failure codes observed
- screenshot or screen recording path if available

### Fast Real-Device Execution
p1) [todo] Use the deployed frontend:
- `https://dsvikstrand.github.io/remix-of-stackwise-advisor/`

p2) [todo] Required final rows:
- iPhone Safari -> `/subscriptions`
- Android Chrome -> `/subscriptions`

p3) [todo] Exact execution steps per device:
- sign in with the designated test account
- open `/subscriptions`
- tap `Connect YouTube`
- complete one successful Google OAuth run
- confirm return route is still `/subscriptions`
- confirm `YouTube connected` appears
- confirm `yt_connect` and `yt_code` are removed from the URL after hydration

p4) [todo] Error-path execution per device:
- start `Connect YouTube`
- deny/cancel at Google
- confirm return route is still `/subscriptions`
- confirm `YouTube connect failed` appears
- confirm `yt_connect` and `yt_code` are removed from the URL after hydration

p5) [todo] Record these exact fields for each device row:
- date/time
- device/browser
- flow (`subscriptions success`, `subscriptions error`)
- actual landing route
- session present (`yes/no`)
- params cleared (`yes/no`)
- success/failure toast shown (`yes/no`)
- screenshot path or screen recording path
- notes / error code

p6) [todo] Practical capture recommendation:
- one screenshot after successful return on `/subscriptions`
- one screenshot after denied return on `/subscriptions`
- optional short screen recording if the browser/app handoff is unstable

p7) [todo] Pass rule for final signoff:
- both iPhone Safari and Android Chrome pass success and error flows on `/subscriptions`
- no wrong-route landing
- no stuck callback params
- no lost session after callback

## Recommended Execution Order
q1) [todo] First close `P1-1` from GitHub settings because it is fast and not code-dependent.
q2) [todo] Then run `P1-2` on iPhone Safari and Android Chrome using the fast real-device execution block above.
q3) [todo] If both pass, decide whether the optional browsers are worth the extra time before launch.

## Completion Rule
r1) [todo] This runbook can move to historical reference once:
- `P1-1` branch-protection proof is recorded in the checklist
- `P1-2` mobile callback matrix evidence is recorded in the checklist
