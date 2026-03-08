# Bleup PWA Program

Status: `active`

## Current Status
a0) [have] Phase 1 foundation and installability are implemented and published.
a1) [have] Phase 2 runtime behavior is implemented behind the frontend rollout flag `VITE_FEATURE_PWA_RUNTIME_V1`.
a2) [todo] Phase 2 still needs installed-mode rollout validation on iPhone Safari and Android Chrome before it can be marked complete in this program.

## Goal
b1) [todo] Convert Bleup into an installable, online-first PWA without creating a separate app product.
b2) [have] The PWA will use the same frontend, same backend API, same Supabase project, same auth model, and same release contract as the current web app.

## Locked Decisions
c1) [have] First-program depth: `Installable Shell`.
c2) [have] Primary validation targets: `iPhone + Android`.
c3) [have] Rollout posture: `Soft Rollout`.
c4) [have] Core implementation stance:
- use `vite-plugin-pwa`
- use a custom service worker via `injectManifest`
- cache only static shell/assets by default
- keep authenticated API traffic, Supabase auth/session traffic, and callback flows network-only
- use `release.json` as the installed-app update/parity source of truth

## Phase Plan
d1) [have] Phase 1: PWA foundation and installability
- add PWA tooling to the Vite build
- add `manifest.webmanifest`
- add proper icon set, display mode, theme/background colors, and install metadata
- register the service worker from frontend bootstrap only when required frontend env exists
- keep the current app/root/router/auth architecture unchanged

d2) [have] Phase 2: Safe caching and update architecture
- add a custom service worker with conservative caching rules
- precache hashed build assets only
- use network-first navigation with an offline fallback surface
- keep `release.json` fresh and uncached for update detection
- keep `/api/*`, Supabase requests, and OAuth/auth callback traffic network-only
- add explicit installed-app update prompting for waiting worker/new `release_sha`
- keep the Phase 2 runtime path behind `VITE_FEATURE_PWA_RUNTIME_V1` until device rollout validation is complete

d3) [todo] Phase 3: Mobile installed-app UX polish
- add iPhone/Android standalone polish
- review safe-area handling, theme color, and launch behavior
- add lightweight installed-app detection where it improves UX
- validate deep-link behavior for key routes in installed mode

d4) [todo] Phase 4: Release hardening, docs, and rollout
- extend frontend release validation to include manifest/service-worker outputs
- add PWA smoke coverage for install/update/offline-shell behavior
- update canonical docs and ops docs so PWA becomes the preferred non-store install story
- roll out conservatively: validate first, then expose install prompting softly, then treat PWA as the primary app-like distribution path

d5) [todo] Phase 5: Deferred post-MVP PWA enhancements
- keep push notifications, background sync, rich offline caching, offline authenticated feed usage, and native-wrapper packaging out of the initial program
- record them as follow-up work only after the installable shell and update model prove stable

## Important Contracts
e1) [todo] New frontend/runtime assets:
- `manifest.webmanifest`
- service worker source and registration path
- offline fallback surface
- install/update prompt surface

e2) [todo] Release/update contract:
- `release.json` remains required and becomes the installed-app version check
- installed clients must be able to compare the running build against the latest published `release_sha`
- the service worker must never cache `release.json` as a stale long-lived asset

e3) [todo] Network/cache policy:
- static hashed assets are cacheable
- HTML/navigation shell is network-first with fallback
- `/api/*` is network-only
- Supabase auth/session traffic is network-only
- OAuth/auth callback flows are network-only
- user-specific feed/subscription/generation data is not service-worker cached in the first program

e4) [have] No backend API redesign is required for the initial PWA program.

## Validation
f1) [todo] Installability checks
- Android Chrome install from `bleup.app`
- iPhone Safari add-to-home-screen flow
- installed app launches into the correct SPA entrypoint
- icons, app name, and standalone display are correct

f2) [todo] Auth and routing checks
- installed app keeps Supabase session across relaunch
- sign-in/sign-up still work in installed mode
- first-login `/welcome` redirect still works
- deep links and refreshes still resolve correctly
- auth/callback paths are not broken by the service worker

f3) [todo] Caching and update checks
- first load works normally online
- repeat load is faster and shell assets are served correctly
- offline navigation shows the intended fallback instead of a broken blank page
- published `release_sha` change triggers a visible update path
- installed app does not stay on an old bundle silently after a new deploy

f4) [have] Local implementation checks passed
- `npx vitest run src/test/pwaRuntimeUtils.test.ts`
- `npx tsc --noEmit`
- `npm run build`
- `VITE_FEATURE_PWA_RUNTIME_V1=true VITE_RELEASE_SHA=phase2check VITE_BASE_PATH=/pwa-phase2-check/ npm run build`
- verified the flagged `sw.js` excludes `release.json`, `/api/*`, and Supabase traffic while including `offline.html` and `bleup-nav-v1`

f5) [todo] Live rollout checks
- publish the frontend with `pwa_runtime_v1=true`
- validate installed-mode update prompt behavior on Android Chrome and iPhone Safari
- validate offline fallback and refresh behavior in installed mode

## Completion Rule
g1) [todo] Move this file to `completed/` when:
- installability, caching/update safety, and installed-mobile polish are validated
- rollout/docs/release hardening are finished
- remaining non-MVP PWA ideas are explicitly deferred into follow-up work
