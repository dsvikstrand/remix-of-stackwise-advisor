# Blueprint Contract Cutover Plan

Status: `completed`

## Goal
a1) [have] Retired the legacy `steps`-first YT2BP contract as the active runtime truth and made `blueprint_sections_v1` the canonical current-runtime blueprint shape across generation, gating, storage, rendering, and current docs.

## Current Baseline
b1) [have] The one-step prompt already says the model should return canonical `blueprint_sections_v1` and should not return legacy `steps`, `summary_variants`, or `notes`.
b2) [have] The current runtime still accepts and depends on the legacy draft shape in several places:
- LLM output validation/types
- deterministic gate / quality logic
- YT2BP pipeline normalization
- blueprint persistence compatibility fallback
- frontend read/render/preview fallbacks
b3) [have] This is the current active implementation plan. Broader cleanup umbrellas are intentionally not the focus.

## Scope Lock
c1) [todo] Keep this plan focused on the blueprint contract cutover.
c2) [todo] Do not widen scope to broad backend cleanup, frontend redesign, or transcript-provider replacement.
c3) [todo] Keep the public YT2BP route contract stable unless a smaller cleanup requires a narrow response-shape clarification.
c4) [todo] Move only one contract layer at a time and validate before pruning the next compatibility layer.

## Phases
d1) [have] Phase 1: freeze the canonical contract in docs.
- primary files:
  - `docs/app/product-spec.md`
  - `docs/architecture.md`
  - `docs/product-specs/yt2bp_v0_contract.md`
- outcome:
  - `blueprint_sections_v1` is documented as the only current-runtime YT2BP blueprint shape
  - `steps`, `summary_variants`, and `notes` are explicitly marked as compatibility-era structures
- status note:
  - the docs freeze now distinguishes the stable v0 response envelope from the canonical blueprint content inside it:
    - current content truth: `draft.sectionsJson` with `blueprint_sections_v1`
    - compatibility carryovers: `draft.steps`, `draft.summaryVariants`, `draft.notes`

d2) [have] Phase 2: remove legacy output acceptance at the LLM boundary.
- primary files:
  - `server/llm/openaiClient.ts`
  - `server/llm/codexGenerationClient.ts`
  - `server/llm/types.ts`
- outcome:
  - current generation path is sections-first
  - legacy draft-shape acceptance is removed at the client boundary
  - temporary compatibility fields (`steps`, `summaryVariants`, `notes`) are now derived after canonical sections parse inside the pipeline

d3) [have] Phase 3: move gates/normalization to normalized sections.
- primary files:
  - `server/index.ts`
  - `server/services/youtubeBlueprintPipeline.ts`
  - `server/services/goldenBlueprintFormat.ts`
- outcome:
  - deterministic gate logic now operates on canonical `sectionsJson`
  - retry feedback and Golden normalization now use canonical sections input
  - `NO_STEPS`-style current-runtime gating is retired in favor of section-native validation

d4) [have] Phase 4: remove backend persistence compatibility fallback.
- primary files:
  - `server/services/blueprintCreation.ts`
  - `server/services/blueprintSections.ts`
  - Supabase migration only if required by the current DB contract
- outcome:
  - current YT2BP writes now require canonical `sections_json`
  - current runtime no longer synthesizes from or falls back to legacy `steps` during the active write path
  - missing `sections_json` or missing `blueprints.sections_json` column now fails explicitly instead of silently downgrading persistence

d5) [have] Phase 5: remove frontend read/render/preview fallbacks.
- primary files:
  - `src/pages/BlueprintDetail.tsx`
  - `src/hooks/useBlueprints.ts`
  - `src/lib/feedPreview.ts`
  - `src/pages/Wall.tsx`
  - `src/components/explore/ExploreResultCard.tsx`
  - `src/components/feed/MyFeedTimeline.tsx`
- outcome:
  - active queries and renderers now use `sections_json` as the only current-runtime content shape for YT2BP display surfaces
  - feed/explore/channel/My Feed previews no longer fall back to legacy `steps` or `selected_items`
  - blueprint detail no longer reconstructs sections from legacy `steps`; missing canonical sections now show an explicit unsupported-state notice

d6) [have] Phase 6: remove adjacent legacy flags and aliases.
- likely targets:
  - `YT2BP_TIER_ONE_STEP_*`
  - `GENERATION_TIER_DUAL_GENERATE_*`
  - compatibility aliases such as `/api/source-pages/:platform/:externalId/videos/generate`
- outcome:
  - current config/docs/runtime no longer advertise compatibility-era controls as normal setup
  - the legacy one-step env compatibility is removed in favor of the canonical prompt path
  - dual-generate env/config branching is removed; runtime now stays single-tier without those compatibility toggles
  - the source-page `/videos/generate` compatibility alias is removed; `/videos/unlock` is the current path
  - manual channel-flow retirement remains a separate cleanup and stays out of scope for this phase

d7) [todo] Phase 7: repo hygiene closure.
- outcome:
  - stale fixtures/docs/examples that still present retired runtime paths are reclassified, moved, or deleted
  - the repo surface matches the current runtime truth cleanly

## Validation Boundaries
e1) [todo] Each phase closes only when its own boundary is proven without reopening wider cleanup scope.
e2) [todo] If a blocked item cannot move because of external/runtime constraints, carry it into `docs/exec-plans/active/tail/mvp-launch-proof-tail.md` instead of keeping multiple active root plans.
e3) [todo] After each phase, update `docs/exec-plans/index.md` only if the classification/runtime truth actually changed.

## Working Rule
f1) [have] This file is docs-only for now.
f2) [todo] Before code changes for any phase, confirm a focused implementation plan for that phase.
f3) [todo] Keep the cutover traceable: one phase, one acceptance boundary, one cleanup class at a time.

## Completion Rule
g1) [have] This file is now moved to `docs/exec-plans/completed/` because `blueprint_sections_v1` is the only current-runtime YT2BP contract across generation, gating, storage, frontend rendering, and current docs.
