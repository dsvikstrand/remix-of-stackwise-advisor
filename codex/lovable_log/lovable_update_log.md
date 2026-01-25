# Lovable Update Log

Date: 2026-01-24

## Purpose
This file summarizes the current direction, recent updates, and required Lovable actions so the platform stays in sync.

---

## Product Direction (Blueprints + Inventories)
- The app is a community library of **Blueprints** (published routines/workflows) created from **Inventories** (templates).
- Discovery happens via tags. Users follow tags; the Wall shows blueprints with those tags.
- Flow: Inventory search ? Build Blueprint ? Publish ? Explore ? Remix.

Working identity lines (keep all three for now):
- "Blueprints is a community library of routines, protocols, and workflows you can remix."
- "Follow tags, discover blueprints, and publish what works."
- "A community of shareable blueprints—recipes for results."

---

## Key Decisions
- Inventory = template layer (Blend/Protein are inventories today).
- Blueprints are published, read-only pages with comments/likes.
- Remix creates a new blueprint and links to source.
- Inventory tags are for inventory discovery only.
- Blueprint tags drive the Wall feed.
- Inventory search = top-rated (likes only) + title search.

---

## Recent Implementation (v0_6 + v0_7)

### Data Model
- Added tables: inventories, inventory_tags, inventory_likes, inventory_remixes, blueprints, blueprint_tags, blueprint_likes, blueprint_comments.
- RLS policies and indexes included.
- Migration: supabase/migrations/20260124213000_inventory_blueprints.sql

### Frontend
- New Inventory pages:
  - /inventory
  - /inventory/create
  - /inventory/:id
  - /inventory/:id/build
- New Blueprint pages:
  - /blueprint/:id
  - /blueprint/:id/remix
- Wall feed now uses Blueprints (not wall_posts).
- Blueprint Builder supports:
  - select items
  - mix notes
  - LLM review focus
  - tags
  - publish

### Edge Functions
- New: supabase/functions/analyze-blueprint/index.ts
  - Streams blueprint review via Lovable AI gateway.

---

## Required Lovable Actions
1) Apply migration:
   - supabase/migrations/20260124213000_inventory_blueprints.sql

2) Deploy function:
   - supabase/functions/analyze-blueprint/index.ts

3) Ensure env var is set:
   - LOVABLE_API_KEY

4) Regenerate Supabase types after migration.

---

## Notes
- Wall now shows Blueprints only (Saved tab removed for now).
- Existing wall_posts data is not used in the new feed.
- Blueprint review generation is now live and streaming.

---

## Next Steps (Optional)
- Add blueprint bookmarks.
- Merge legacy wall_posts feed with blueprints if needed.
- Add tagging hubs later once blueprints are stable.

