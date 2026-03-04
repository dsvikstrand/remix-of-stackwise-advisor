# Agentic Docs Pack (`bleuV1`)

This folder is the control surface for moving from manual planning to multi-agent execution.

Current status: paused reference track. Manual iterative delivery is the active execution mode.

## Reference Status
- This pack is legacy reference-only and does not define active runtime execution.
- Current active execution tracker: `docs/exec-plans/active/mvp-launch-hardening-phases.md`.
- Paused strategy references:
  - `docs/exec-plans/active/on-pause/bleuv1-mvp-hardening-playbook.md`
  - `docs/exec-plans/active/on-pause/project-bleuv1-mvp-foundation.md`

## Intent
- Phase 1 (foundation): decision-locked descriptive contracts.
- Phase 2 (executable): machine-actionable role/task/eval contracts.
- Phase 3 (automation): scripted orchestration and CI automation on top of Phase 2.

## Phase 2.1 Hardening Locks
1. Lifecycle includes explicit manual-review state: `candidate_pending_manual_review`.
2. Unified API envelope is default for planned endpoints.
3. Auth model uses user/service split.
4. Idempotency uses hybrid strategy.
5. Evaluator mode defaults to all-gates-run with aggregated decision.
6. Code-changing tasks require lint+test always, build conditionally by risk area.
7. CP3 milestone unit is objective bundle (3-8 tasks, one integration candidate).

## Read Order (Foundation)
1. `docs/_archive/legacy-ass-agentic/agentic/foundation/north-star.md`
2. `docs/_archive/legacy-ass-agentic/agentic/foundation/mvp-scope-contract.md`
3. `docs/_archive/legacy-ass-agentic/agentic/foundation/system-map.md`
4. `docs/_archive/legacy-ass-agentic/agentic/foundation/lifecycle-and-state-machine.md`
5. `docs/_archive/legacy-ass-agentic/agentic/foundation/data-contract.md`
6. `docs/_archive/legacy-ass-agentic/agentic/foundation/gate-policy.md`
7. `docs/_archive/legacy-ass-agentic/agentic/foundation/risk-register.md`
8. `docs/_archive/legacy-ass-agentic/agentic/foundation/glossary.md`

## Read Order (Executable)
1. `docs/_archive/legacy-ass-agentic/agentic/executable/decision-matrix.md`
2. `docs/_archive/legacy-ass-agentic/agentic/executable/task-queue-scope.md`
3. `docs/_archive/legacy-ass-agentic/agentic/executable/task-schema.md`
4. `docs/_archive/legacy-ass-agentic/agentic/executable/task-artifact.schema.json`
5. `docs/_archive/legacy-ass-agentic/agentic/executable/interface-contracts.md`
6. `docs/_archive/legacy-ass-agentic/agentic/executable/schema-contracts.md`
7. `docs/_archive/legacy-ass-agentic/agentic/executable/state-machine-tests.md`
8. `docs/_archive/legacy-ass-agentic/agentic/executable/eval-harness.md`
9. `docs/_archive/legacy-ass-agentic/agentic/executable/stop-inspect-policy.md`
10. `docs/_archive/legacy-ass-agentic/agentic/executable/terminology-rules.md`
11. `docs/_archive/legacy-ass-agentic/agentic/executable/role-contracts.md`
12. `docs/_archive/legacy-ass-agentic/agentic/executable/review-gates.md`

## Foundation -> Executable Mapping
- `north-star.md` -> `decision-matrix.md`
- `mvp-scope-contract.md` -> `task-queue-scope.md`
- `system-map.md` -> `interface-contracts.md`
- `data-contract.md` -> `schema-contracts.md`
- `lifecycle-and-state-machine.md` -> `state-machine-tests.md`
- `gate-policy.md` -> `eval-harness.md`
- `risk-register.md` -> `stop-inspect-policy.md`
- `glossary.md` -> `terminology-rules.md`

## Role Ownership
- Planner: decision matrix + queue scope + task schema.
- Implementer: interface/schema/state contracts.
- Evaluator: eval harness + review gates + task schema validation.
- Integrator: stop-inspect policy + release gate decisions.

## Guardrails
- Canonical docs remain authoritative for runtime state:
  - `docs/app/product-spec.md`
  - `docs/architecture.md`
  - `docs/exec-plans/index.md`
- Active agentic docs are contracts, not optional guidance.
- Any spec-only interfaces must be explicitly labeled as not yet implemented.
