# Project 1 - IA And Lingo

Status: `draft`

## Goal
Establish consistent information architecture and naming so cold users understand the app as blueprint-first with followable Channels.

## In Scope
- UI terminology map (`Channels` vs `tags`)
- navigation placement and wording decisions
- channel-first empty states and onboarding copy
- curated channel taxonomy v0 definition

## Out Of Scope
- feed visual density implementation
- ranking logic implementation
- backend follow APIs implementation

## Dependencies
- channels-first-ux-program.md approved baseline

## Final Terminology Map (v0)
- `Channels` (UI): followable curated content lanes.
- `Tags` (UI): secondary metadata chips for search/explore context.
- `tags` (internal): freeform label system retained for compatibility.

## Step 1 Copy Convention (Locked)
- CTA verbs: `Join Channel` / `Leave Channel`.
- Compatibility: route remains `/tags` in v0; user-facing title uses `Channels`.
- Feed/explore copy: use `channels` where follow behavior is implied.
- Metadata chips: keep compact hashtag chips (`#slug`) with no `Tags:` prefix.
- Scope guard: copy-only pass, no API/schema/type/runtime-contract changes.

## Navigation Model (v0)
- Keep `Explore` in nav.
- Inside Explore:
  - Channels section appears before tag search/browse.
  - clear CTA: `Follow channel`.

## Empty States And Onboarding Copy
- No followed channels state:
  - headline: `Follow channels to shape your feed`
  - body: concise explanation + top curated channel list
- Explore landing:
  - headline: `Browse channels`
  - body: `Channels are curated blueprint streams`

## Channel Taxonomy v0 Seed Policy
- curated-only list, 10-25 channels maximum
- each channel must have:
  - slug
  - concise one-line purpose
  - tag mapping rules
- no user channel creation in v0

## Step-by-Step Implementation Plan (for later execution)
1. inventory current UI labels and pages using `tag/tags` language.
2. define replacement matrix (`where to rename`, `where to keep tags`).
3. update nav and Explore copy specs.
4. define channel seed list and mapping criteria.
5. review all copy for consistency and ambiguity.

## Edge Cases / Failure Modes
- tags-only content with no channel mapping
- over-broad channels causing overlap confusion
- ambiguous page labels (`tag` in old UI + `channel` in new UI)

## ST Checklist
- terminology consistency scan passes on target screens
- no contradictory label in nav/explore/detail pages
- no blocked flows when user has zero followed channels

## Acceptance Criteria
- all target screens use `Channels` for followable entities
- users can identify where to follow channels in <=2 taps from Explore
- no major terminology conflict remains in P1 scope

## Done Definition
- exact UI states defined: explore default, no-follow state, followed state entry copy
- exact metrics wired requirement documented for P5 handoff
- exact regression checks listed and runnable by implementer

## Rollback Notes
- if terminology change causes confusion, revert UI labels while keeping taxonomy doc intact
- keep internal tags untouched to avoid data disruption
