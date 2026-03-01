# bleuV1 MVP Scope Contract

## Scope Intent
Define decision-complete boundaries for the final MVP slice so implementation can proceed with minimal product invention.

## Must Ship
1. YouTube-only source adapter for imported blueprint supply.
2. My Feed as the personal unfiltered lane for pulled content.
3. Channel candidate path as a second-stage distribution step.
4. Channel gating policy with channel-fit, quality, safety, and PII checks.
5. Community interaction on shared blueprints (likes/comments) plus insight/remix contribution model.
6. Provenance and dedupe rules using canonical YouTube identity.

## Can Ship (If Capacity Allows)
1. Auto mode for source pull (default remains selected/manual approve).
2. Additional ranking improvements for My Feed and channel surfaces.
3. Expanded analytics dimensions beyond baseline MVP gates.

## Will Not Ship In This MVP
1. Multi-adapter rollout beyond YouTube.
2. Standalone free-form user post model as a first-class content type.
3. User-created channels and full moderation platform.
4. Autonomous channel publishing without gate decisioning.

## Deprecation Policy: Library-First Flows
Policy goal:
- De-emphasize library-first creation as the primary product narrative.

Rules:
1. Existing library flows may remain runtime-compatible during transition.
2. New MVP messaging and IA must not describe library-first as the core value path.
3. Any retained library functionality is considered compatibility/deferred surface until explicitly re-scoped.
4. Future removal requires migration notice in active execution plans.

## Boundary Contract
1. My Feed can be broader/noisier and includes channel-failed items.
2. Channel feeds are quality-controlled shared lanes.
3. Insight/remix content attaches to imported blueprints and does not become a separate default feed supply.

## Change Control
Changes to must-ship scope require:
1. update to `docs/app/product-spec.md`
2. update to `docs/architecture.md`
3. update to `docs/exec-plans/active/project-bleuv1-mvp-foundation.md`

## Completion Criteria
Scope lock is complete when:
1. no unresolved decision placeholders remain
2. all active docs align with this contract
3. docs checks pass (`docs:refresh-check`, `docs:link-check`)
