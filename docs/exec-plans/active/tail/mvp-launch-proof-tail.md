# MVP Launch Proof Tail

Status: `active`

## Goal
a1) [todo] Close or explicitly defer the remaining launch-proof checks without reopening the larger MVP hardening program.

## Scope
b1) [have] This plan is intentionally small and tracks the remaining proof/deferred tail without reopening broader implementation umbrellas.
b2) [have] The completed implementation/history now lives in `docs/exec-plans/completed/mvp-readiness-review-followup.md`.
b3) [have] The launch-gate board remains `docs/ops/mvp-launch-readiness-checklist.md`.
b4) [have] This file also carries forward small deferred/proof items from reclassified plans when they are not the current implementation focus.

## Open Checks
c1) [todo] `P1-1` Branch protection proof
- confirm a real branch/ruleset applies to `main`
- confirm required CI checks are enforced before merge
- capture one PR-level merge-block proof or explicitly defer this for MVP iteration mode

c2) [todo] `P1-2` Android Chrome real-device OAuth callback validation
- run one successful `/subscriptions` YouTube connect return flow on Android Chrome
- run one denied `/subscriptions` flow on Android Chrome
- confirm landing route stays `/subscriptions`, session remains present, and callback params clear

c3) [todo] `Feed` source-driven `For You` live verification
- use one test account with at least one active source subscription and `auto_unlock_enabled=true`
- verify a new source video from that subscribed source appears in `For You`
- verify auto-on behavior:
  - generated item resolves to a blueprint card when auto generation succeeds
  - item remains locked when auto generation cannot run yet
- verify the non-subscribed-source rule remains intact:
  - a manually unlocked non-subscribed blueprint can appear in `For You`
  - future videos from that same non-subscribed source do not start appearing unless the user later subscribes
- source of truth for expected behavior: `docs/app/mvp-feed-and-channel-model.md`

## Supporting Evidence
d1) [have] GitHub ruleset/PR proof runbook: `docs/ops/p1-1-p1-2-verification-runbook.md`
d2) [have] Playwright callback evidence: `docs/ops/playwright-p1-2-callback-evidence.md`
d3) [have] Launch board status/evidence: `docs/ops/mvp-launch-readiness-checklist.md`

## Carried-Forward Deferred Items
e1) [todo] Transcript-provider live rollout follow-up
- apply Supabase transcript-cache + legacy-cleanup migrations during the next live rollout:
  - `supabase/migrations/20260314183000_youtube_transcript_cache_v1.sql`
  - `supabase/migrations/20260314203000_retire_yt_to_text_legacy_state.sql`
- capture one later local/live `/api/youtube-to-blueprint` success sample after the current upstream transcript-provider constraints clear
- source history: `docs/exec-plans/completed/transcript-provider-robustness-plan.md`

e2) [todo] PWA follow-up proof
- validate installed-mode behavior on Android Chrome
- validate the installed-app update prompt on a future frontend publish
- validate the Android native-install/install-CTA flow if that rollout is resumed
- source history: `docs/exec-plans/completed/bleup-pwa-program.md`

e3) [todo] Runtime simplification follow-up
- if this track is resumed later, close docs canonicalization and one MVP validation/capacity guard before treating it as current implementation work again
- source history: `docs/exec-plans/completed/mvp-runtime-simplification-plan.md`

## Completion Rule
f1) [todo] Move this file to `completed/` when the remaining proof/deferred checks are either:
- closed with evidence in the launch checklist
- or explicitly deferred with a documented launch decision
