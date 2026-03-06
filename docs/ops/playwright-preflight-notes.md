# Playwright Preflight Notes

Status: `active`

## Goal
a1) [todo] Build a small Playwright preflight harness that prepares the repo for the real `P1-1` / `P1-2` launch verification work.

## Scope
b1) [have] This prep pass targets the deployed frontend at `https://dsvikstrand.github.io/remix-of-stackwise-advisor` by default.
b2) [have] The harness is Chromium-only and uses device emulation for early mobile-path checks.
b3) [todo] This prep pass does not replace the final real-device matrix for mobile OAuth callbacks.

## Harness
c1) [have] Added Playwright config in `playwright.preflight.config.ts`.
c2) [have] Added local `.env` loading helper in `tests/playwright/env.ts` so the harness can reuse dedicated test-account credentials without committing secrets.
c3) [have] Added saved-auth setup in `tests/playwright/auth.setup.ts`.
c4) [have] Added five prep tests in `tests/playwright/preflight.spec.ts`.

## Prep Tests
d1) [have] `T1` public landing smoke:
- confirm deployed root renders the app shell and unauthenticated entry point.

d2) [have] `T2` auth route smoke:
- confirm `/auth` renders expected sign-in UI and keeps the deep-link route stable.

d3) [have] `T3` iPhone-emulated subscriptions connect preflight:
- confirm authenticated `/subscriptions` loads
- confirm `Connect YouTube` triggers `POST /api/youtube/connection/start`
- confirm the returned `auth_url` points to Google OAuth without relying on a full external login run

d4) [have] `T4` Pixel-emulated welcome callback cleanup:
- confirm `/welcome?yt_connect=success` clears callback params after hydration
- confirm the onboarding surface remains usable after cleanup

d5) [have] `T5` signed-in lazy-credit-refresh observation:
- confirm `/wall` stays quiet on `/api/credits` while the user menu is closed
- confirm opening the menu triggers exactly one credits fetch
- confirm `/search` still performs a one-shot credits fetch

## Expected Findings To Capture
e1) [todo] Whether saved auth state is stable enough for later callback tests.
e2) [todo] Whether mobile emulation is sufficient for route/callback cleanup checks.
e3) [todo] Whether OAuth start can be validated without a full external-provider run.
e4) [todo] Whether lazy credit refresh can be observed reliably via browser network events.
e5) [todo] Which parts of `P1-1` / `P1-2` still require manual or real-device validation.

## Final Readout
f1) [have] Prep suite command:
- `npm run test:playwright:preflight`

f2) [have] Result:
- `6/6` tests passed in `54.6s`

f3) [have] Passed tests:
- `auth.setup.ts` saved a reusable signed-in storage state for `BLEU_ACCOUNT_1`
- `T1` public landing shell rendered correctly on the deployed frontend
- `T2` `/auth` deep link rendered correctly without inheriting signed-in state
- `T3` iPhone-emulated `/subscriptions` successfully hit `POST /api/youtube/connection/start` and attempted the Google OAuth redirect
- `T4` Pixel-emulated `/subscriptions?yt_connect=success` cleared callback params after hydration
- `T5` signed-in lazy-credit-refresh behavior matched the expected pattern: quiet on `/wall` with menu closed, one credits request on menu open, one credits request on `/search`

f4) [have] Key harness findings:
- GitHub Pages sub-paths are the first Playwright gotcha here. The base URL must include the repo sub-path and tests should navigate with relative paths like `auth`, `subscriptions`, and `wall`, not leading-slash routes.
- Project-level `storageState` can leak into “public” checks if a test creates a new context without explicitly clearing state. For anonymous checks, the harness now forces `storageState: { cookies: [], origins: [] }`.
- The `Subscriptions` callback consumer is a better automation anchor than `Welcome` for this account state. `Welcome` is more onboarding-stateful, while `/subscriptions` stays stable for callback-param cleanup checks.
- For OAuth-start verification, the stable assertion is: backend start endpoint returns `200` and the browser attempts to leave for Google. Parsing the intermediate JSON body was less reliable than observing the redirect attempt directly.
- Lazy credit refresh is straightforward to observe with Playwright network listeners and is now cheap to regression-test.

f5) [have] What Playwright can cover well for the real tasks:
- repeated callback-path regression checks on deployed frontend routes
- signed-in auth-state reuse without manually extracting fresh bearer tokens every run
- mobile-emulated preflight for route handling and callback-param cleanup
- browser screenshots, traces, and failure artifacts for evidence/debugging

f6) [todo] What still needs manual or higher-confidence validation:
- real iPhone Safari and Android Chrome callback flows for final `P1-2` signoff
- GitHub ruleset / branch-protection screenshots and PR merge-block proof for `P1-1`
- any callback behavior that depends on real browser/app handoff beyond Chromium emulation

f7) [todo] Recommended next Playwright tasks:
- add one real `P1-2` runner for `/subscriptions` YouTube connect that records screenshots/traces around the callback cycle
- add one optional `Welcome`-specific callback test using a dedicated account with a known onboarding state if you want deterministic coverage there
- add a separate Playwright capture script for GitHub ruleset and PR pages only if repo-admin browser access is available
