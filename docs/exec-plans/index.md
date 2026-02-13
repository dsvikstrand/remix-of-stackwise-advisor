# Execution Plans Index

- Active plans:
  - `docs/exec-plans/active/`
  - `docs/exec-plans/active/channels-first-ux-program.md`
  - `docs/exec-plans/active/project-1-ia-and-lingo.md`
  - `docs/exec-plans/active/project-2-feed-density.md`
  - `docs/exec-plans/active/project-3-channel-following.md`
  - `docs/exec-plans/active/project-4-blueprint-detail-priority.md`
  - `docs/exec-plans/active/project-5-metrics-validation.md`
- Completed plans:
  - `docs/exec-plans/completed/`
- Deferred work:
  - `docs/exec-plans/tech-debt-tracker.md`

## Current Program Progress
- P1 Step 1/3: completed (channels terminology pass).
- P1 Step 2/3: completed (Explore IA pass, lightweight scope).
- P1 Step 3/3: docs-level taxonomy and mapping spec completed:
  - `docs/references/channel-taxonomy-v0.md`
- P2 Step 1/4: completed (summary hygiene + compact text rules).
- P2 Step 2/4: completed (flatter row shell + wall-to-wall tightening).
- P2 Step 3/4: completed (channel-first metadata, comments meta on blueprint rows).
- P2 Step 4/4: completed (polish + regression closure + focused YT2BP/ASS smoke checks).
- P3: spec lock completed (3-step execution plan + SUCC metrics), implementation is in progress.
- P3 Step 1/3: implemented on core surfaces (Explore + Channels page + Wall) with explicit join-state model and filter-only chip cleanup.
- P3 Phase 1 IA/routing: completed (`/channels` + `/b/:channelSlug` + `/tags` deprecation redirect).
- P3 Phase 2: completed (real channel feeds on `/b/:channelSlug`, deterministic `b/<channel-slug>` resolver labels on Wall/Explore, and `b/general` fallback lane).
- P3 Step 2/3: completed for ranking/cold-start policy on Wall (`For You` joined-first + global fill; `Latest`/`Trending` unchanged; zero-join CTA inline).
- P3 Phase 3: completed (channels-only follow UX, `/channels` section restructuring, legacy non-curated follow cleanup, and tag follow controls removed from Explore/Wall).
