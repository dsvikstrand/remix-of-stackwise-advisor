# Product Spec (Current Runtime)

## Overview
Blueprints is a channels-first community app for creating and discovering step-based blueprint content.

Core model:
- Channels: curated followable lanes for feed personalization
- Tags: blueprint metadata for search/discovery
- Blueprints: public or private routines built from library items and/or YouTube generation

## Primary User Flows
f1) Discover blueprints on `Feed` (`/wall`) with scope + sort controls.
f2) Join channels on `/channels` or `/b/:channelSlug`.
f3) Start create flow (`Create`) -> choose channel -> choose source (Library or YouTube).
f4) Build/refine blueprint, run AI review, publish publicly.
f5) Open blueprint detail, like/comment, and navigate via tags to Explore.

## Routes and IA
p1) Home: `/`
p2) Feed: `/wall`
p3) Explore: `/explore`
p4) Channels index: `/channels`
p5) Channel page: `/b/:channelSlug`
p6) Inventory list: `/inventory`
p7) Inventory create: `/inventory/create`
p8) Inventory detail: `/inventory/:inventoryId`
p9) Inventory build/editor: `/inventory/:inventoryId/build`
p10) Blueprint detail: `/blueprint/:blueprintId`
p11) Blueprint remix: `/blueprint/:blueprintId/remix`
p12) YouTube to Blueprint: `/youtube`
p13) Auth: `/auth`
p14) Settings: `/settings`
p15) Profile: `/u/:userId`

Compatibility redirects:
- `/tags` -> `/channels`
- `/blueprints` -> `/wall`

## Feed Behavior (Wall)
- Scope selector:
  - `For You` (signed-in personalized lane)
  - `All Channels`
  - specific channel lanes (`b/<slug>`)
- Sort selector:
  - `Latest`
  - `Trending`
- Personalized behavior:
  - `For You` prioritizes joined-channel content with global fill fallback.

## Channel Model (MVP)
- Curated admin-owned channel catalog (no user-created channels in MVP).
- Runtime join state remains tag-backed (`tag_follows`) for compatibility.
- Canonical channel URL label shape: `b/<channel-slug>`.
- `b/general` is fallback/read-only lane.

## Create and Publish Model
- Create is channel-scoped.
- Public publish requires valid channel context and joined state.
- Channel assignment is applied by injecting channel backing tag slug at publish time.

## Data Model (Supabase, Current)
d1) `blueprints`, `blueprint_tags`, `blueprint_likes`, `blueprint_comments`
d2) `inventories` and related legacy inventory tables (still active runtime tables)
d3) `tag_follows`, `tags`, `profiles`, `post_bookmarks`
d4) telemetry sink table: `mvp_events`

## Backend Surfaces
- App API server endpoints under `/api/*` (including `/api/youtube-to-blueprint`).
- Supabase Edge functions include `log-event` and generation-related functions.

## Key References
- Architecture: `docs/architecture.md`
- Program + project status: `docs/exec-plans/index.md`
- Channels taxonomy: `docs/references/channel-taxonomy-v0.md`
- YT2BP contract: `docs/product-specs/yt2bp_v0_contract.md`
