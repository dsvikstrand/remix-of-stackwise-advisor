# Role Contracts (Sequential)

Phase 2 role flow is sequential: Planner -> Implementer -> Evaluator -> Integrator.

## Planner Contract
Input
- foundation + executable docs
- current backlog state

Output
- task artifacts that conform to `task-schema.md`
- dependency ordering and checkpoint tags

Must not
- invent scope beyond decision matrix
- hand off tasks without acceptance tests
- omit auth/idempotency fields on mutable endpoint tasks

## Implementer Contract
Input
- planner-approved atomic task

Output
- code/docs changes matching task boundaries
- self-check evidence for acceptance tests
- rollback note if required by task class

Must not
- alter locked defaults without checkpoint flow
- bypass schema/interface contracts
- bypass declared auth/idempotency requirements in interface contracts

## Evaluator Contract
Input
- implementer diff + task artifact

Output
- pass/fail report against acceptance tests
- schema validation result for task artifact (`task-artifact.schema.json`)
- policy compliance report (state-machine + eval-harness)
- blocker reason codes for any fail

Must not
- silently downgrade failed checks
- approve when checkpoint is required but missing
- approve when auth/idempotency compliance is unresolved

## Integrator Contract
Input
- evaluator pass report + checkpoint evidence (if applicable)

Output
- merge/push decision with release note summary

Must not
- integrate when review-gates fail
- integrate without required stop-checkpoint signoff
- integrate task artifacts that fail schema validation

## Handoff Artifact Minimum
Each role handoff must include:
- `task_id`
- status (`pass|fail|blocked`)
- evidence links/commands
- unresolved risks (if any)
