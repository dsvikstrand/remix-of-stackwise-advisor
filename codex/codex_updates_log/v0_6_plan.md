# v0_6 Plan — Blueprints Direction

## Purpose
Define the next product direction and a scalable path forward based on recent conversations.

---

## North Star (Identity)
The product is a community space where people publish and remix **Blueprints** (routines, habits, workflows, protocols, etc.).

Working identity lines (keep all three for now):
- a1) "Blueprints is a community library of routines, protocols, and workflows you can remix."
- a2) "Follow tags, discover blueprints, and publish what works."
- a3) "A community of shareable blueprints—recipes for results."

---

## Core Objects (Vocabulary)
- b1) **Inventory** = template layer (Blend/Protein are inventories today).
- b2) **Blueprint** = published, shareable output derived from an inventory.
- b3) **Build** = in-progress draft created from an inventory.
- b4) **Remix** = derived blueprint or inventory that links back to source.

---

## Primary Flows (End-to-End)
1) Discovery via tags ? Wall feed (Blueprints only)
2) Open Blueprint ? dedicated page (read-only + comments/likes)
3) Remix Blueprint ? opens builder (Inventory + Mix + LLM review) ? publish a new Blueprint

---

## Inventory (Template) System
### Inventory Creation
- c1) Any user can create an inventory (lightweight prompts, minimal customization).
- c2) Prompts required:
  - c2a) Name
  - c2b) "What should your inventory contain?"
  - c2c) "Give a few categories this inventory should contain"
- c3) LLM auto-generates the inventory contents from prompts (no manual fill required).

### Inventory Discovery
- c4) Search by **tag** or **title**.
- c5) For a tag (e.g., skincare), show **top-rated** inventory (likes only).
- c6) Tags are user-generated (no curation at MVP).

### Inventory Permissions & Remixing
- c7) Only creator can edit their inventory.
- c8) Remix creates a new inventory (inherits tags automatically).
- c9) Inventories are public by default, can be private.
- c10) If a private inventory is used to publish a public blueprint, inventory can remain private OR auto-promote (allowed).

---

## Blueprint (Published) System
### Blueprint Creation
- d1) Build from an inventory in a neutral state (no preselected items).
- d2) User selects items, mixes, and runs LLM review with custom focus instructions.
- d3) Publish creates a dedicated Blueprint page.

### Blueprint Page (Dedicated)
- d4) Read-only view: LLM review + comments/likes/reviews.
- d5) No inventory/mix editing on published view.
- d6) Remix CTA opens builder with original data as a starting point.

### Tags
- d7) Blueprint tags drive Wall feed.
- d8) Inventory tags are used only for inventory discovery.
- d9) Tags are multi-faceted (e.g., "sleep" can include multiple blueprint types).

---

## Wall (Feed)
- e1) Wall remains the main feed name.
- e2) Shows only Blueprints from followed tags.
- e3) Ranking: default to top likes (can add recency later).

---

## UX Priorities (Near-Term)
- f1) Fix user experience for builder + published page.
- f2) Keep friction low: minimal prompts, clear flows, readable results.
- f3) Avoid heavy customization until system stabilizes.

---

## Implementation Plan (Phased)
### Phase 1 — Inventory Creator (MVP)
- g1) Create inventory creation flow (name + 2 prompts).
- g2) Add LLM auto-generate step for inventory contents.
- g3) Add inventory tags + likes + ranking logic.
- g4) Add search by title or tag.

### Phase 2 — Blueprint Builder (Use Inventory)
- g5) Build from inventory in neutral state.
- g6) Inventory ? Mix ? LLM review.
- g7) Post/publish creates Blueprint.

### Phase 3 — Blueprint Published Page
- g8) Dedicated Blueprint page (read-only).
- g9) Comments/likes/reviews.
- g10) Remix CTA ? builder.

### Phase 4 — Wall Refinements
- g11) Feed ranking + filters.
- g12) Improve tag discovery (later: tag pages/hubs).

---

## Open Questions (Later)
- h1) Tag moderation / reporting.
- h2) Weighted ranking (likes + recency).
- h3) Inventory approval systems.
- h4) Template categories beyond tags.

---

## Immediate Next Step (Recommended)
- i1) Draft the Inventory Creator spec and data model.
- i2) Validate the UI flow for: Search inventory ? Build blueprint ? Publish ? Explore.

