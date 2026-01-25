# Architecture Map (v0_7)

Date: 2026-01-25

## 1) Core Concepts (Vocabulary)
- Inventory = reusable template (what Blend/Protein used to represent)
- Build = in-progress draft created from an Inventory
- Blueprint = published result of a Build (public, read-only + comments/likes)
- Remix = new Inventory/Blueprint derived from a source (lineage)

## 2) Routes (App.tsx)
Public
- / (Index / StackLab legacy page)
- /blend
- /protein
- /auth

Auth-gated
- /wall (Blueprint feed)
- /wall/:postId (legacy post detail)
- /inventory
- /inventory/create
- /inventory/:inventoryId
- /inventory/:inventoryId/build
- /blueprint/:blueprintId
- /blueprint/:blueprintId/remix
- /my-recipes
- /profile
- /tags

## 3) Pages and Responsibilities
- Index: legacy StackLab builder (not blueprint-based)
- Blend / Protein: legacy inventory builders (LLM analysis + post)
- Inventory: search + list + like inventories
- InventoryCreate: LLM-generated inventory schema + tags + publish
- InventoryDetail: inventory overview + CTA to build
- InventoryBuild: build a blueprint from an inventory
- BlueprintDetail: published blueprint page (LLM review + comments + remix)
- BlueprintRemix: build from existing blueprint
- Wall: blueprint feed (For You / Latest / Trending)
- Tags: tag directory + follow/unfollow (currently shared for inventory + blueprint)

## 4) Component Map (Key Files)
Shared
- AppHeader, AppNavigation, RequireAuth, TagInput, UserMenu

Blueprint
- BlueprintBuilder (LLM review generation + publish)
- BlueprintItemPicker (item selection + custom item modal)
- BlueprintRecipeAccordion (selected item list + optional context)
- BlueprintAnalysisView (tabs parsing LLM output)
- BlueprintLoadingAnimation

Blend/Protein (legacy)
- BlendInventoryPicker, BlendRecipeAccordion, BlendAnalysisView, MixButton, etc.
- ProteinSourcePicker, ProteinRecipeAccordion, ProteinAnalysisView

## 5) Hooks (Data Access)
- useInventories
  - search inventories by tag/title
  - default seed inventories (Blend/Protein)
  - create inventory, like inventory
- useBlueprints
  - create blueprint, like blueprint
  - fetch blueprint detail and comments
- useTags
  - tag directory, follow/unfollow, suggestions
- useComments/useBookmarks/useRecipes (legacy wall posts)

## 6) Supabase Data Model (Key Tables)
Legacy
- user_recipes, wall_posts, post_likes, post_bookmarks, wall_comments

Blueprint System
- inventories
- inventory_tags
- inventory_likes
- inventory_remixes
- blueprints
- blueprint_tags
- blueprint_likes
- blueprint_comments

Tags
- tags
- tag_follows

## 7) Edge Functions
- analyze-blend (legacy)
- analyze-protein (legacy)
- analyze-blueprint (blueprint review, SSE)
- generate-inventory (LLM schema generation, JSON)
- generate-stack (legacy)

## 8) Core Data Flows
Inventory creation
1) User enters keywords -> generate-inventory
2) LLM returns schema + suggested tags
3) User confirms -> inventories + inventory_tags

Inventory discovery
1) /inventory search by tag/title
2) tag -> inventory_tags -> inventories (rank by likes)

Build blueprint
1) /inventory/:id/build
2) select items + optional context + mix notes
3) analyze-blueprint (SSE)
4) publish -> blueprints + blueprint_tags

Blueprint explore + remix
1) /wall (blueprints only)
2) /blueprint/:id detail
3) remix -> /blueprint/:id/remix -> publish new blueprint

## 9) Permissions / RLS Notes
- Inventories: readable if public OR creator is viewer
- Blueprints: readable if public OR creator is viewer
- Tags: globally readable; follows are per user

## 10) Known Gaps / TODO
- TODO: selected_items shape mismatch (objects with context vs string arrays) affects detail/remix
- TODO: tag separation (inventory vs blueprint) is not implemented; both use shared tags table
- No blueprint bookmarks yet (Saved tab removed)
- Default inventories are owned by first user who seeds them (expected by current design)

