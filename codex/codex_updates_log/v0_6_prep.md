# v0_6 Prep — Data Model + Routes + UX Flow

## Goal
Provide a single prep reference that locks vocabulary, routes, data objects, and core UX flows before implementation.

---

## Vocabulary (Public Terms)
- Blueprint: published, shareable output
- Inventory: the template layer (Blend/Protein today)
- Build: in-progress draft created from an inventory
- Remix: derived blueprint or inventory linked to a source

---

## Routes (Proposed)
- /wall
  - Main discovery feed (Blueprints only)
- /blueprint/:blueprintId
  - Published view (read-only)
- /blueprint/:blueprintId/remix
  - Builder view prefilled from source
- /inventory
  - Inventory discovery/search
- /inventory/:inventoryId
  - Inventory details (neutral state)
- /inventory/:inventoryId/build
  - Builder view from inventory
- /inventory/create
  - Inventory creator

---

## Data Model (Minimum)

### inventory
- id
- title
- prompt_inventory ("What should your inventory contain?")
- prompt_categories ("Give a few categories this inventory should contain")
- generated_schema (LLM output; items + categories)
- creator_user_id
- is_public
- created_at, updated_at

### inventory_tags
- inventory_id
- tag_id

### inventory_likes
- inventory_id
- user_id
- created_at

### inventory_remix
- inventory_id (child)
- source_inventory_id
- user_id
- created_at

---

### blueprint
- id
- inventory_id
- creator_user_id
- title
- selected_items
- mix_notes
- review_prompt (user focus/instructions)
- llm_review
- tags
- is_public
- created_at, updated_at
- source_blueprint_id (nullable, for remix lineage)

### blueprint_tags
- blueprint_id
- tag_id

### blueprint_likes
- blueprint_id
- user_id
- created_at

### blueprint_comments
- blueprint_id
- user_id
- content
- created_at

---

### tag
- id
- slug (lowercase)
- name
- created_at

---

## Ranking Rules
- Inventory search (by tag): return top-rated (likes only).
- Wall feed (by followed tags): rank by top likes (recency later).

---

## UX Flow Map (Text)

### A) Create Inventory
1) /inventory/create
2) User enters: name + 2 prompts
3) LLM auto-generates inventory schema
4) Save inventory (public by default)

### B) Discover Inventory + Build Blueprint
1) /inventory search by tag or title
2) Pick top-rated inventory for tag
3) Open /inventory/:id (neutral state)
4) Choose items ? Mix ? LLM review
5) Publish ? creates Blueprint

### C) Explore Blueprint
1) /wall shows followed-tag blueprints
2) Open /blueprint/:id
3) Read LLM review + comments
4) Remix CTA ? /blueprint/:id/remix

### D) Remix Blueprint
1) Remix opens builder with prefilled data
2) Edit inventory items or mix
3) Generate new LLM review
4) Publish new Blueprint (links to source)

---

## Permissions (MVP)
- Any user can create inventories.
- Only creator can edit their inventory.
- Remix creates a new inventory or blueprint with a source link.
- Inventory tags are user-generated.

---

## Open Later
- Tag moderation/reporting
- Weighted ranking (likes + recency)
- Inventory approval workflows
- Tag hubs (dedicated tag pages)

