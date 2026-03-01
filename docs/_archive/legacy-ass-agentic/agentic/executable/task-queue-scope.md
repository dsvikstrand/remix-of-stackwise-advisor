# Task Queue Scope Contract

Purpose: ensure generated tasks are atomic, testable, and aligned to `bleuV1` scope.

## Allowed Task Classes
1. `docs_contract`
- Update canonical/foundation/executable docs with traceable scope alignment.

2. `interface_spec`
- Specify API/interface payloads, error buckets, and compatibility notes.

3. `implementation`
- Code changes limited to one intent block with explicit acceptance criteria.

4. `evaluation`
- Add/adjust tests, eval harness assertions, and decision logs.

5. `ops_observability`
- Logging, metrics extraction, runbook updates.

## Disallowed Task Classes (MVP)
1. Multi-adapter expansion.
2. Standalone free-form social post primitives.
3. User-created channel governance platform.
4. Unbounded refactors without lifecycle tie-in.

## Decomposition Rules
1. One task should target one primary outcome.
2. One task should not cross more than two bounded domains (for example: frontend + docs, backend + tests).
3. If a task needs a schema change plus major UI change, split it.
4. Every task must have deterministic acceptance tests and rollback notes.

## Task Sizing Targets
- Small: <= 8 files
- Medium: <= 15 files
- Large: split into sub-tasks unless explicitly approved at checkpoint.

## Dependency Rules
1. A task can depend only on completed tasks or locked doc contracts.
2. Planner must produce topological order with explicit blockers.
3. Cyclic dependencies are invalid and must be split.

## Traceability Requirement
Each task must map to at least one source in:
- `docs/_archive/legacy-ass-agentic/agentic/foundation/`
- `docs/_archive/legacy-ass-agentic/agentic/executable/`
- canonical docs (`docs/app/product-spec.md`, `docs/architecture.md`)
