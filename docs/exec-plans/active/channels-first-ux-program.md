# Channels-First UX Program

Status: `active`

## 1) Problem Statement
Current UX is blueprint-capable but not cold-user efficient. Users face:
- too much visual chrome (stacked cards/containers/air)
- weak navigation meaning for discovery/follow behavior
- over-emphasis on authors vs content stream intent

Program goal: shift to blueprint-first discovery with Reddit-like density and a followable Channel layer.

## 2) Principles
1. Blueprint-first: discovery and creation should prioritize blueprint value quickly.
2. Dense by default: reduce unnecessary spacing and container nesting.
3. Channel over author: users follow content lanes, not personalities.
4. Additive migration: preserve existing tags/data contracts while adding Channels.
5. Mobile-first execution, desktop parity required.

## 3) Scope
### In scope
- IA/lingo updates (`tags` UI -> `channels` UI where follow behavior exists)
- feed density and hierarchy changes
- channel following model and ranking behavior
- blueprint detail page hierarchy improvements
- metrics and validation plan

### Out of scope
- full community moderation system
- user-created channels in v0
- runtime instruction-security implementation

## 4) Non-Goals
- replacing tags as storage primitive
- schema-breaking migration in this phase
- redesigning every page before proving channel/follow signal

## 5) Program SUCC Criteria (Numeric)
- `clarity_rate >= 70%` for first-session users
- `follow_intent_rate >= 25%` first-session users follow >=1 channel
- `feed_to_detail_open_rate >= 30%` on mobile
- `detail_to_publish_or_save_intent >= 15%` where action exists
- `time_to_first_useful_blueprint <= 90s` median

## 6) Proposed Data Model v0 (Additive)
1. `channels`
   - `id`, `slug`, `name`, `description`, `status`, `visibility`, `created_at`, `updated_at`
2. `channel_tag_map`
   - `channel_id`, `tag`, `weight` (optional), `created_at`
3. `user_channel_follows`
   - `user_id`, `channel_id`, `created_at`

Compatibility:
- tags remain functional for current discovery and assignment.
- channels are additive and can be derived from tag overlap in v0.

## 7) Proposed API Touchpoints (Design-Level)
1. `GET /api/channels` (curated list)
2. `POST /api/channels/:slug/follow`
3. `DELETE /api/channels/:slug/follow`
4. `GET /api/channels/:slug/feed`
5. optional mapper endpoint `POST /api/channels/map-tags` (admin/tooling only)

## 8) Dependency Graph
- P1 IA + lingo -> unblocks P2/P3 copy and navigation consistency.
- P2 feed density -> unblocks P4 detail hierarchy coherence.
- P3 channel following -> unblocks P5 validation metrics.
- P4 detail priority -> feeds P5 conversion/quality metrics.

## 9) Rollout Strategy (Phase Gates)
- Gate A: P1 complete + terminology consistency pass
- Gate B: P2 complete + mobile/desktop visual parity check
- Gate C: P3 complete + follow/unfollow flow stable
- Gate D: P4 complete + detail readability and action hierarchy pass
- Gate E: P5 pilot metrics reviewed -> GO/HOLD/PIVOT

## 10) Risks and Mitigations
1. Risk: naming confusion (`channels` vs `tags`)
   - Mitigation: explicit UX copy and glossary in product docs
2. Risk: taxonomy drift
   - Mitigation: curated-only channels in v0
3. Risk: over-tight UI hurts readability
   - Mitigation: typography/line-height safeguards in P2
4. Risk: weak follow adoption
   - Mitigation: channel prompts at key moments (feed/detail)

## 11) Execution Order
1. P1 IA + Lingo
2. P2 Feed Density
3. P3 Channel Following
4. P4 Blueprint Detail Priority
5. P5 Metrics + Validation

Rule: each project requires ST pass + acceptance criteria pass before next project.

## 12) Ownership Table
| Document | Owner Area | Status |
|---|---|---|
| channels-first-ux-program.md | Product/UX | active |
| project-1-ia-and-lingo.md | Product + Frontend | draft |
| project-2-feed-density.md | UX + Frontend | draft |
| project-3-channel-following.md | Product + Backend + Frontend | draft |
| project-4-blueprint-detail-priority.md | UX + Frontend | draft |
| project-5-metrics-validation.md | Product + Analytics + Backend | draft |

## 13) Decision Log
- D-001: UI term = `Channels` for followable content lanes.
- D-002: `tags` remain internal/freeform metadata in v0.
- D-003: keep `Explore` as the initial channel entry point.
- D-004: v0 channels are curated-only.
- D-005: both mobile and desktop are in scope (mobile-first execution).
- D-006: Step 1 copy convention uses `Join Channel` / `Leave Channel`; keep `/tags` route for compatibility.
- D-007: Step 2 Explore IA is channels-first (`Your Channels` -> onboarding -> trending -> topic search), with lightweight Wall copy alignment only.
- D-008: Step 3 taxonomy is locked in docs (`docs/references/channel-taxonomy-v0.md`) with 20 curated channels, conservative mapping, and `admin-owner` governance.
- D-009: Project 2 Step 1 locks text hygiene first (markdown cleanup, 3-line compact summaries, and chip visibility constant) on Wall and Explore cards.
- D-010: Project 2 Step 2 locks flatter row shell on Wall+Explore, uses `b/channels` interim context label, and removes author block from list rows.
- D-011: Project 2 Step 2.1 tightens Wall further toward wall-to-wall rhythm (remove outer list frame, tighten padding, slight `b/channels` emphasis bump).
- D-012: Feed tags use a single-row full-tag rule (no wrapped second row, no `+N more` collapse badge) on Wall and Explore cards.
- D-013: Project 2 Step 3 locks Reddit-style compact meta rows (`likes/comments/share` for blueprints, `likes/share` for inventories), with top-right relative time and no item counts in list rows.
- D-014: Project 2 Step 4 closed with polish + regression pass; Explore tag-search regressions were fixed (`shake` and `#shake`), and YT2BP + ASS focused smoke checks passed.
