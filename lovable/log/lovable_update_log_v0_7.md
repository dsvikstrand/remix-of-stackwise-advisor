# Lovable Update Log (Detailed)

Date: 2026-01-24

## Purpose
This file summarizes the new direction, naming conventions, implemented changes, and required Lovable actions so the platform stays aligned with the current product direction.

---

## Product Direction (Community-First)
We are now explicitly community-focused: the goal is a large pool of shareable blueprints where users can find, use, review, comment, like, and follow topics of interest (Reddit-style, but for blueprints).

Key direction points
- a1) Blueprints are the public, shareable units that power discovery.
- a2) Inventories are the reusable templates that power creation.
- a3) Tags are the main discovery mechanism; followed tags drive the Wall feed.
- a4) Remixing builds a community graph (source → remix lineage).
- a5) The Wall is the primary feed and should surface tag-followed blueprints.

---

## Naming Convention Update (Old → New)
Previous naming used recipe/stack/post language. We are standardizing on the following terms:
- b1) Inventory = reusable template (what Blend/Protein used to represent).
- b2) Build = in-progress draft created from an inventory.
- b3) Blueprint = published result of a build (what posts used to represent).
- b4) Remix = creating a new blueprint (or inventory) from an existing one with a source link.

Direction summary
- c1) Inventories power creation.
- c2) Blueprints power sharing + discovery.

---

## Core User Flow (End-to-End)
- d1) User searches inventories (by tag or title).
- d2) User picks top-rated inventory for a tag (likes-only ranking).
- d3) User builds a blueprint (selects items, adds mix notes, requests LLM review).
- d4) User publishes blueprint (tags required).
- d5) Wall shows blueprints from followed tags.
- d6) Users open blueprint pages to review/comment/like.
- d7) Users remix a blueprint to create a new variant linked to source.

---

## Inventory System (Templates)
- e1) Any user can create an inventory (minimal prompts, low customization).
- e2) Required prompts: name, “what should your inventory contain?”, “categories it should contain”.
- e3) Inventory tags are user-generated and only used for inventory discovery.
- e4) Inventory search: top-rated by likes + title/tag search.
- e5) Inventory remixing creates a new inventory; tags inherit by default.
- e6) Inventory can be public or private (public by default).

---

## Blueprint System (Published Content)
- f1) Blueprints are read-only public pages with comments + likes.
- f2) Blueprints are created from inventories in a neutral state (no preselected items).
- f3) LLM review is generated from the selected items + user focus prompt.
- f4) Remix creates a new blueprint linked to the source blueprint.
- f5) Blueprint tags are user-generated and drive Wall discovery.

---

## Wall (Feed)
- g1) Wall now uses Blueprints only (not wall_posts).
- g2) For You tab = blueprints whose tags are followed by the user.
- g3) Trending = last 3 days, sorted by likes, then time.
- g4) Latest = time-based.

---

## Recent Implementation (v0_6 + v0_7)

### Data Model
- h1) Added tables: inventories, inventory_tags, inventory_likes, inventory_remixes, blueprints, blueprint_tags, blueprint_likes, blueprint_comments.
- h2) RLS policies and indexes included.
- h3) Migration: supabase/migrations/20260124213000_inventory_blueprints.sql

### Frontend
- i1) New Inventory pages: /inventory, /inventory/create, /inventory/:id, /inventory/:id/build
- i2) New Blueprint pages: /blueprint/:id, /blueprint/:id/remix
- i3) Wall feed now reads from blueprints, not wall_posts.
- i4) Blueprint builder supports: select items, mix notes, LLM review focus, tags, publish.

### Edge Functions
- j1) New function: supabase/functions/analyze-blueprint/index.ts
- j2) Streams blueprint reviews via Lovable AI gateway (SSE).

---

## Required Lovable Actions
- k1) Apply migration: supabase/migrations/20260124213000_inventory_blueprints.sql
- k2) Deploy function: supabase/functions/analyze-blueprint/index.ts
- k3) Ensure env var: LOVABLE_API_KEY
- k4) Regenerate Supabase types after migration.

---

## Notes / Warnings
- l1) Wall “Saved” tab removed for now (no blueprint bookmarks yet).
- l2) Existing wall_posts data is not used in the new feed.
- l3) Blueprint review generation is live and streaming.

---

## Optional Next Steps
- m1) Add blueprint bookmarks.
- m2) Merge legacy wall_posts feed with blueprints if needed.
- m3) Add tag hubs once blueprints are stable.

