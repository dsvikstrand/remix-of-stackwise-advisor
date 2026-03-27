# Blueprint Prompt v5 Caveats Plan

Status: `on-pause`

## Goal
a1) [todo] Install a new one-step YT2BP prompt contract `v5` that replaces the human-facing `Open Questions` section semantics with `Caveats`.

a2) [todo] Keep the runtime schema unchanged:
- `draft.sectionsJson` stays `blueprint_sections_v1`
- the stored/runtime key stays `open_questions`
- `v4` remains intact for rollback

a3) [todo] Make the first rollout low-risk:
- prompt + gate semantics first
- UI relabel only after output quality looks good
- no DB/API/schema migration

## Why This Exists
b1) [have] The current `v4` contract is the default runtime prompt:
- [golden_bp_prompt_contract_one_step_v4.md](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/docs/golden_blueprint/golden_bp_prompt_contract_one_step_v4.md)
- [prompts.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/llm/prompts.ts)

b2) [have] The current quality/control surfaces still treat the last section as literal questions:
- [llmNativeQualityGate.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/llmNativeQualityGate.ts)
- [goldenBlueprintFormat.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/goldenBlueprintFormat.ts)

b3) [have] The desired product change is semantic, not structural:
- sharper skepticism
- transcript-grounded caveats
- no external fact-check invention
- no hostile takedown mode

b4) [have] A full schema rename to `caveats` would be unnecessarily broad for the first experiment.

## Decision Lock
c1) [have] `v5` keeps the same JSON shape as `v4`.

c2) [have] The `open_questions` key remains the canonical runtime/storage key.

c3) [have] `Caveats` is the new human-facing section meaning.

c4) [have] `v4` remains available as the rollback target.

c5) [todo] The first rollout should avoid changing stored payload shape, API shape, or DB expectations.

## Caveats Contract
d1) [have] The `Caveats` section should mean:
- where the source’s reasoning, evidence, scope, or confidence gets weaker
- important limitations, hidden assumptions, oversimplifications, internal tensions, or under-supported claims
- transcript-grounded skepticism, not imported outside critique

d2) [have] The required guardrail is:
- `Caveats` may be sharp, but it must stay source-grounded. It can question strength, logic, scope, and evidence quality, but it must not claim factual falsehood, deception, or bad intent unless the transcript itself directly supports that conclusion.

d3) [todo] In `v5`, the model should be told explicitly:
- write `Caveats` semantically
- return that content in the existing `open_questions` field

## Scope Lock
e1) [todo] In scope:
- new `v5` prompt file
- default prompt path switch
- retry/repair instruction updates
- gate/formatter semantic updates
- optional later UI relabel
- targeted docs updates

e2) [todo] Out of scope for the first rollout:
- DB migration
- `open_questions` field rename
- API envelope changes
- broad frontend renderer rewrites
- reprocessing historical blueprints

## Phase 1
f1) [todo] Create [golden_bp_prompt_contract_one_step_v5.md](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/docs/golden_blueprint/golden_bp_prompt_contract_one_step_v5.md) from `v4`.

f2) [todo] Change only the human contract semantics:
- `Open Questions` becomes `Caveats` in prose and section naming
- schema example still uses `open_questions`
- field-shape rules still use `open_questions`
- add explicit language that `Caveats` content must be returned via `open_questions`

f3) [todo] Update [prompts.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/llm/prompts.ts) so the default one-step prompt path points to `v5`.

f4) [todo] Keep env override support untouched so we can point runtime back to `v4` immediately if needed.

## Phase 2
g1) [todo] Update retry/repair/structure hints to use `Caveats` semantically while preserving the exact JSON key `open_questions`.

g2) [todo] Primary files:
- [prompts.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/llm/prompts.ts)
- [youtubeBlueprintPipeline.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/youtubeBlueprintPipeline.ts)

g3) [todo] Required wording changes:
- “all required sections” lists should say `Caveats` instead of `Open Questions` where they describe human sections
- schema repair rules should still say `open_questions`
- retry copy should stop implying that bullets must be literal questions

## Phase 3
h1) [todo] Remove question-mark-specific gate assumptions and replace them with Caveats-compatible semantics.

h2) [todo] Primary files:
- [llmNativeQualityGate.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/llmNativeQualityGate.ts)
- [goldenBlueprintFormat.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/goldenBlueprintFormat.ts)

h3) [todo] Change:
- remove or replace `OPEN_QUESTIONS_NOT_QUESTIONS`
- stop requiring `?` endings
- keep bullet-count and sentence-limit enforcement
- keep the section strict enough to avoid generic filler

## Phase 4
i1) [todo] Run a real `v5` quality proof before relabeling the frontend.

i2) [todo] Proof goals:
- generated output still validates as `blueprint_sections_v1`
- `open_questions` is populated with Caveats-style content
- the content is sharper without drifting into hallucinated fact-checking or gratuitous cynicism

i3) [todo] Record proof from:
- a few real YT2BP runs
- prompt path stored in generation trace/runtime logs
- manual inspection of the resulting Caveats bullets

## Phase 5
j1) [todo] Only after `v5` output quality looks good, relabel the UI from `Open Questions` to `Caveats`.

j2) [todo] Primary files:
- [blueprintSections.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/lib/blueprintSections.ts)
- [server/services/blueprintSections.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/blueprintSections.ts)
- [BlueprintDetail.tsx](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/pages/BlueprintDetail.tsx)
- [LandingDemoScene.tsx](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/components/home/landing-v2/LandingDemoScene.tsx)

j3) [todo] Important caveat:
- a global relabel will make old `v4` blueprints display as `Caveats` too unless we later add version-aware rendering

j4) [todo] Default first decision:
- accept the global relabel if the semantic overlap is good enough
- add version-aware rendering only if old content looks misleading

## Phase 6
k1) [todo] Update current docs that reference `v4` as canonical.

k2) [todo] Primary files:
- [architecture.md](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/docs/architecture.md)
- [yt2bp_runbook.md](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/docs/ops/yt2bp_runbook.md)
- [product-spec.md](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/docs/app/product-spec.md)
- [core-direction-lock.md](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/docs/app/core-direction-lock.md)
- [yt2bp_v0_contract.md](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/docs/product-specs/yt2bp_v0_contract.md)

k3) [todo] The docs should state:
- `v5` is the default one-step prompt contract
- runtime schema remains `blueprint_sections_v1`
- the `open_questions` field is now used semantically for `Caveats`

## Test Surface
l1) [todo] Update targeted tests only, not every fixture in one sweep.

l2) [todo] Highest-priority test files:
- [llmNativeQualityGate.test.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/test/llmNativeQualityGate.test.ts)
- [blueprintSections.test.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/test/blueprintSections.test.ts)
- [goldenBlueprintFormatBackend.test.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/test/goldenBlueprintFormatBackend.test.ts)
- [youtubeBlueprintPipelineTranscriptPrune.test.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/test/youtubeBlueprintPipelineTranscriptPrune.test.ts)

l3) [todo] Testing expectations:
- `open_questions` remains the field name
- no gate requires caveat bullets to end with `?`
- display-layer snapshots can render `Caveats`

## Verification
m1) [todo] Run:
- `npm run typecheck`
- targeted tests for prompt builder, gate, blueprint sections, and pipeline prompt instructions

m2) [todo] After backend install, run a real timed/proof generation:
- confirm `prompt_template_path` is `...v5.md`
- confirm the generated JSON still validates
- inspect whether Caveats content is meaningfully better than `v4`

m3) [todo] If UI relabel is included later, verify one real blueprint detail page shows `Caveats` correctly.

## Acceptance Criteria
n1) [todo] The default runtime prompt is `v5`.

n2) [todo] The runtime schema remains unchanged.

n3) [todo] `open_questions` contains Caveats-style content instead of unresolved-question bullets.

n4) [todo] No validator, parser, or retry path breaks due to the semantic shift.

n5) [todo] `v4` remains fully available for immediate rollback.

## Rollback
o1) [have] Fast rollback path:
- point [prompts.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/llm/prompts.ts) back to `v4`

o2) [todo] If UI relabel shipped and needs to be reverted:
- restore display labels from `Caveats` back to `Open Questions`

o3) [have] No data migration means no rollback cleanup is needed for stored JSON.
