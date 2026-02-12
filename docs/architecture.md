# Architecture

## 1) Intent And Boundaries
- Product scope:
  - Public app for discovering and creating blueprints.
  - YT2BP (YouTube to Blueprint) is a production flow in MVP.
  - ASS (Agentic Seed System) seeds content and validates generation quality/safety.
- Non-goals in current architecture:
  - No hard dependency on domain-specific golden artifacts for runtime YT2BP.
  - No instruction-security runtime gate yet (stub only).

## 2) Runtime Topology
- Frontend:
  - React + Vite app.
  - Main flows in `src/pages/*`, including `YouTubeToBlueprint.tsx`.
- Backend:
  - Express server in `server/index.ts`.
  - Endpoint family under `/api/*`, including `/api/youtube-to-blueprint`.
- Data:
  - Supabase is the system of record for published artifacts.
- Eval assets:
  - Runtime policy/config under `eval/methods/v0/*`.
- Operations:
  - Oracle VM runtime with runbook in `docs/ops/yt2bp_runbook.md`.

## 3) Core Flows
- YT2BP flow:
  - URL input -> transcript fetch -> draft blueprint generation ->
  - deterministic checks + LLM quality + LLM content safety + PII checks ->
  - success response -> publish from UI.
- ASS flow:
  - Persona + control composition -> generation nodes -> eval gates -> apply/publish path.
  - Spec reference: `docs/design-docs/seed_ass_spec.md`.

## 4) Contracts And Policy Surfaces
- API contract:
  - `docs/product-specs/yt2bp_v0_contract.md` is canonical for request/response/error buckets.
- Product behavior:
  - `docs/app/product-spec.md` and `docs/product-specs/youtube_to_blueprint_plan.md`.
- Eval policy:
  - `eval/methods/v0/llm_blueprint_quality_v0/global_pack_v0.json`
  - `eval/methods/v0/llm_content_safety_grading_v0/global_pack_v0.json`
  - `eval/methods/v0/pii_leakage_v0/global_pack_v0.json`

## 5) Invariants
- API compatibility:
  - YT2BP v0 changes should be additive or versioned.
- Safety:
  - Content safety, PII, and deterministic structural checks can independently block.
- Operations:
  - Production debugging is logs-first.
  - Rate-limits and feature toggles are env-driven.

## 6) Failure Modes And Recovery
- Frequent classes:
  - `INVALID_URL`, `NO_CAPTIONS`, `PROVIDER_FAIL`, `TIMEOUT`, `RATE_LIMITED`,
    `GENERATION_FAIL`, `SAFETY_BLOCKED`, `PII_BLOCKED`.
- Recovery authority:
  - Runbook commands in `docs/ops/yt2bp_runbook.md`.
  - Fast rollback through env toggles (`YT2BP_*` flags).

## 7) Extension Model
- New source adapters:
  - Add endpoint-specific source pipeline and keep contract stable.
- New eval classes:
  - Add config pack in `eval/methods/v0/<method_id>/`.
  - Register class and wire through active policy only after smoke tests.
- Future track:
  - `llm_instruction_security_v0` is reserved for prompt-injection/jailbreak handling.

## 8) Document Ownership
- Canonical architecture doc: `docs/architecture.md`.
- Index + navigation: `docs/README.md`.
- Freshness mapping for required doc updates: `docs/_freshness_map.json`.
