# Product Spec (Code-Based)

## Overview
Blueprints is a community app for sharing step-by-step routines. Users generate or select an inventory, build a blueprint by choosing items and adding steps/context, receive an LLM review, and publish to the community for discovery and feedback.

## Primary User Flow
f1) Discover blueprints on the Wall or via Tags.
f2) Explore Inventories and pick one to build from.
f3) Generate a new Inventory with the LLM, then edit items/tags.
f4) Build a Blueprint by selecting items and assigning them to steps with context.
f5) Generate an LLM review for the Blueprint.
f6) Publish the Blueprint to the community.

## Key Pages and Routes
p1) Home: `src/pages/Home.tsx` (community-first landing)
p2) Inventory Library: `src/pages/Inventory.tsx`
p3) Inventory Create: `src/pages/InventoryCreate.tsx`
p4) Inventory Build: `src/pages/InventoryBuild.tsx`
p5) Blueprint Detail: `src/pages/BlueprintDetail.tsx`
p6) Blueprint Remix: `src/pages/BlueprintRemix.tsx`
p7) Wall: `src/pages/Wall.tsx`
p8) Tags: `src/pages/Tags.tsx`
p9) User Profile: `src/pages/UserProfile.tsx`

## Core Data Model (Supabase)
d1) `inventories`: LLM-generated schema + metadata
d2) `inventory_tags`, `inventory_likes`, `inventory_remixes`
d3) `blueprints`: selected items, steps, review, metadata
d4) `blueprint_tags`, `blueprint_likes`, `blueprint_comments`
d5) `user_follows`, `post_bookmarks`, `profiles`

## LLM Edge Functions
e1) Generate inventory: `supabase/functions/generate-inventory/index.ts`
e2) Analyze blueprint (review): `supabase/functions/analyze-blueprint/index.ts`

## Current Scope vs. Future
s1) Current: community discovery focused on Blueprints.
s2) Future: optional discovery of Inventories alongside Blueprints.

## Repo Pointers for Reviewers
r1) Routes: `src/App.tsx`
r2) Inventory UX: `src/components/inventory/*`, `src/hooks/useInventories.ts`
r3) Blueprint UX: `src/components/blueprint/*`, `src/hooks/useBlueprints.ts`
r4) Community UX: `src/components/wall/*`, `src/components/profile/*`, `src/hooks/useComments.ts`
r5) Supabase client/types: `src/integrations/supabase/*`
r6) Migrations: `supabase/migrations/*`
