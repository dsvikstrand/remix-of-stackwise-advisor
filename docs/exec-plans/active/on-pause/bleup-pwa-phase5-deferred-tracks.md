# Bleup PWA Phase 5 Deferred Tracks

Status: `paused`

## Goal
a1) [todo] Preserve the Phase 5 post-MVP PWA roadmap as a decision-complete deferred mini-plan, without treating it as current implementation work.

## Current Contract
b1) [have] Bleup already ships as an installable, online-first PWA.
b2) [have] Phase 5 is intentionally deferred until the remaining Phase 4 rollout proofs are closed:
- Android Chrome installed-mode validation
- installed update-prompt validation after a newer frontend publish
b3) [have] Phase 5 must not change the current production contract until a child track is explicitly activated.

## Deferred Tracks
c1) [have] `5A` Push and re-engagement is now implemented in code behind rollout gates, but not yet live-validated.
- current gated scope:
  - web push for installed PWA users
  - notification permission UX and cooldown rules
  - delivery model tied to the existing Bleup inbox/notification concepts
  - installed-app routing from notification taps into existing Bleup routes
- remaining rollout gates:
  - Supabase migration applied
  - backend VAPID envs configured
  - frontend/backend push flags enabled for live testing
  - installed-device push delivery proof for `comment_reply`, `generation_succeeded`, and `generation_failed`
- out of scope in the first live track:
  - desktop-first push expansion
  - background sync
  - native app notification SDKs

c2) [todo] `5B` Richer offline read behavior
- candidate scope:
  - limited cached authenticated reads for explicitly allowed surfaces
  - stale-data labeling
  - session-safe cache partitioning and sign-out cleanup
  - route-by-route allowlist instead of broad API caching
- out of scope in the first track:
  - offline generation
  - offline subscription import
  - write-behind mutation queues

c3) [todo] `5C` Native-wrapper/store readiness
- candidate scope:
  - wrapper-path evaluation after the PWA is stable
  - packaging readiness for later store submission
  - icon/splash/metadata/store-policy prep if native distribution becomes worth it
- out of scope in the first track:
  - separate native backend
  - separate native auth model
  - duplicated mobile product surfaces

## Activation Rules
d1) [todo] No Phase 5 child track starts until:
- Android Chrome installed-mode validation is closed
- installed update-prompt validation is closed
- `smoke:release` remains green on production
- no unresolved stale-client or installability regressions remain open

d2) [todo] Every child track requires its own approved implementation plan before code starts.

d3) [todo] Every child plan must define:
- rollout and rollback
- acceptance tests
- device/platform scope
- any data/storage changes

## Completion Rule
e1) [todo] Keep this file paused until one Phase 5 child track is intentionally activated, or until the main PWA program is closed and the deferred tracks are moved into a longer-term roadmap/debt surface.
