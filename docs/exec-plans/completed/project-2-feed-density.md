# Project 2 - Feed Density (Step Plan)

Status: `completed`

## Summary
Project 2 implements a near-clone Reddit feed rhythm for core blueprint feed surfaces while preserving current runtime contracts.

Locked direction for this project:
- compact but elegant density
- flatter list-row structure (reduced card chrome)
- channel-first hierarchy over author-first hierarchy
- visible actions row in list view
- keep app color identity; copy Reddit interaction/layout patterns

## Goals
- improve scan speed for cold users
- reduce vertical waste and nested card feeling
- make channels the primary contextual signal in feed rows
- preserve readability despite higher density

## In Scope
- feed/list visual density for blueprint surfaces (Wall and primary blueprint lists)
- markdown cleanup in summaries for list previews
- metadata hierarchy redesign for channel-first layout
- mobile-first implementation with desktop parity
- fallback switch for chip noise (`3-4` visible -> `0` visible)

## Out Of Scope
- runtime channel model migration
- ranking algorithm changes
- comments/thread UX implementation
- full library feed rebrand (deferred)
- backend/API/schema changes

## Dependencies
- Project 1 complete (Step 1-3)
- channels taxonomy doc present for naming consistency

## Step Breakdown (4 Steps)

### Step 1 - Content Hygiene and Text Compaction
Objective: remove noisy summary artifacts and lock text behavior before layout compression.

Tasks:
1. strip markdown symbols from summary previews (e.g., `###`, list markers, stray formatting tokens)
2. normalize summary fallback text and empty handling
3. enforce summary clamp for compact feed (`3` lines on mobile; desktop may show one extra line if clean)
4. lock channel label format in feed rows as `b/channels` (interim)
5. implement chip visibility config (default `3-4`, quick fallback to `0`)

Acceptance:
- no visible markdown artifacts in top feed previews
- compact summaries are readable and stable across top feed items
- chip fallback can be switched without component rewrites

Step 1 implementation lock (completed decisions):
- Surface scope: `Wall + Explore cards` only.
- Summary source priority: cleaned `llm_review` first, then secondary text, then compact fallback.
- Line clamp target: `3` lines on mobile-focused feed previews.
- Chip visibility: constant-based toggle (`VISIBLE_CHIPS_COUNT`, default `4`, fast fallback to `0`).

### Step 2 - Feed Row Shell (Flatter Near-Clone)
Objective: convert current stacked card rhythm into flatter, tighter row rhythm.

Tasks:
1. reduce heavy border/shadow layering in list rows
2. tighten vertical spacing and row padding
3. make hierarchy explicit in order:
   - channel label (`r/channel` medium)
   - title (large)
   - value summary (small)
   - lightweight meta + actions
4. keep actions visible by default
5. preserve tap targets and row click behavior

Acceptance:
- feed feels continuous (not nested-card heavy)
- row hierarchy matches locked order on mobile and desktop
- no interaction regressions on row/action taps

Step 2 implementation lock:
- Surface scope: `Wall + Explore` only.
- Row hierarchy: `b/channels` -> title -> compact summary -> lightweight meta/actions.
- Author block is removed from list rows in this step (detail pages keep attribution).
- Container style: subtle separators / reduced card chrome (no heavy nested-card look).
- Interim context label is generic `b/channels` until creator-assigned channels runtime lands.

Step 2.1 tightening pass:
- Remove residual outer feed frame feel on Wall (no rounded outer list shell).
- Slightly tighter row padding and smaller outer page gutters on mobile.
- Increase `b/channels` salience slightly (uppercase + stronger contrast), while keeping it lightweight.
- Tag display rule: render only one non-wrapping row of full tags; no `+N more` badge and no wrapped second row.

### Step 3 - Channel-First Metadata and Author De-Emphasis
Objective: reduce user/author prominence in list view and reinforce channel/content focus.

Tasks:
1. de-emphasize or remove author block in list rows where possible
2. retain author context in detail page as smaller secondary metadata
3. keep channel context visible above title in list view
4. maintain action row visibility and clarity

Acceptance:
- list rows are channel/content-first
- author metadata remains available where needed (detail)
- no confusion about where content comes from

Step 3 implementation lock:
- Wall + Explore list rows move to tighter wall-to-wall rhythm with minimal chrome.
- `b/channels` uses semi-bold micro-label styling; time moves to the top-right as lightweight relative text.
- Bottom row switches to Reddit-style compact actions:
  - blueprint rows: likes + comments + share
  - inventory rows: likes + share (comments omitted for correctness)
- Item counts are removed from list rows.
- Blueprint comment counts are live, fetched via additive client query against `blueprint_comments`.

### Step 4 - Polish, Regression Pass, and Docs Closure
Objective: stabilize visual behavior and document final standards.

Tasks:
1. mobile/desktop spacing polish pass
2. verify no clipping/overlap across long titles, long summaries, and banner variants
3. compare against pre-P2 baseline captures for density/readability improvement
4. update docs with final visual rules and known deferred items
5. run focused smoke checks and capture outcomes

Acceptance:
- compact layout is stable across target feed states
- readability remains acceptable with higher density
- docs reflect final P2 decisions and deferments

Step 4 closure (2026-02-13):
- Wall and Explore list rows were polished to remove residual nested-card feel and keep a wall-to-wall rhythm.
- Metadata hierarchy was finalized:
  - top row: `b/channels` + relative time
  - bottom row (blueprints): likes + comments + share
  - bottom row (inventories): likes + share
- Regressions resolved:
  - Explore card tag-click now performs search reliably.
  - Plain search terms now include tag-matched results even without `#` prefix.
- Smoke checks passed:
  - `npm run build`
  - `npm run smoke:yt2bp -- --base-url https://bapi.vdsai.cloud`
  - `TMPDIR=/tmp npx -y tsx ./codex/skills/seed-blueprints/scripts/seed_stage0.ts --spec seed/seed_spec_v0.json --asp strength_training_male_v0 --auth-only`

## Test Matrix (P2)

### Functional UI Scenarios
1. Wall feed row with short title + short summary
2. Wall feed row with long title + long summary
3. row with banner/image preview
4. row without banner/image
5. logged-out and logged-in feed behavior
6. chip mode at default (`3-4`) and fallback (`0`)

### Device/Viewport Scenarios
1. mobile narrow viewport (primary target)
2. desktop standard viewport
3. no clipped action icons/buttons at both breakpoints

### Content Integrity Scenarios
1. markdown cleanup removes heading/list tokens from preview
2. no broken unicode/formatting artifacts in summaries
3. line clamps preserve readable sentence fragments

## Rollout Gates
- Gate P2-A: Step 1 passes summary hygiene checks
- Gate P2-B: Step 2 row shell passes interaction checks
- Gate P2-C: Step 3 metadata hierarchy validated (channel-first)
- Gate P2-D: Step 4 regression and docs closure complete

Progression rule:
- do not advance to next step until current step meets acceptance and smoke checks.

## Smoke Tests (ST)
- `npm run build`
- manual feed QA on mobile + desktop for target scenarios
- `npm run docs:refresh-check -- --json`
- `npm run docs:link-check`

## Acceptance Criteria (Project-Level)
- feed list appears materially tighter without becoming messy
- channel context is primary in list rows
- markdown preview noise is eliminated
- actions remain visible and tappable
- no runtime/API/schema changes introduced

## Rollback Notes
- rollback by step, not full-project if possible
- keep Step 1 markdown cleanup if later visual step regresses
- preserve documented token/spacing baseline for quick revert

## Explicit Assumptions
- `tags` runtime model remains active under channel UI language
- library feed can stay on current style until dedicated rebrand
- join behavior can apply on refresh (no instant rerank requirement in P2)

## Wall-to-Wall Default Layout (Follow-On, 2026-02-13)
Note: after P2 was closed, we began applying the same wall-to-wall (Reddit-style) layout defaults across the entire app so the feed rhythm becomes the default UI language (not just Wall/Explore).

Layout primitives (frontend-only):
- `src/components/layout/Page.tsx` (`PageRoot`, `PageMain`, `PageSection`, `PageDivider`)
- `src/components/layout/FeedList.tsx` (`FeedList`, `FeedRowLink`)
- `src/components/layout/WallToWallGrid.tsx` (table-like grid separators for Inventory/Blueprints)

Rules:
- Remove ambient background blobs/gradients globally.
- Default page width: `max-w-3xl` with tight gutters (`px-3 sm:px-4`).
- List surfaces use dividers and hover highlights (no nested cards).
- Grid surfaces keep grid, but use separator borders (no elevation/shadow/backdrop-blur).

Migration checklist (Run 1 targets):
- Explore, Blueprints, Inventory, YouTube, Home, Settings, Auth, UserProfile (and keep Wall/Channels consistent).

Migration checklist (Run 2 targets):
- Detail pages: BlueprintDetail, InventoryDetail, PostDetail, BlueprintRemix, NotFound
- Home modules: DiscoverRoutines, FeaturedLibrariesStarter, DemoInventory, FeaturedTags
- Global primitives: Card baseline is minimal by default (no blur/shadow), header/nav containers are solid + bordered
- `/tags` link debt: tag surfaces link to Explore (`/explore?q=...`), and Explore supports `?q=` prefill for deep links
