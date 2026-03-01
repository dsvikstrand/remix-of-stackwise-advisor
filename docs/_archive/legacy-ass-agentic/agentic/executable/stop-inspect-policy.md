# Stop-And-Inspect Policy

Purpose: keep human intervention minimal and focused on high-risk boundaries.

## Milestone Definition (CP3 Unit)
A milestone is an objective bundle of 3-8 dependent tasks that produces exactly one integration candidate.

Rules:
- milestone is objective-based, not calendar-based.
- one integration candidate maps to one CP3 review.

## Mandatory Checkpoints (Exactly 3)

### CP1: Scope And Identity Check
Trigger
- Any change that may alter product identity, scope boundaries, or default modes.

Required human review
- Confirm source-first identity remains primary.
- Confirm standalone free-form posting is still out of MVP scope.

Artifacts required
- decision diff summary
- affected docs list

### CP2: Safety/Policy And Data-Boundary Check
Trigger
- Any change to safety/PII/quality thresholds, gate semantics, schema compatibility, or auth-sensitive paths.

Required human review
- Confirm fail-closed behavior where required.
- Confirm rollback path exists.

Artifacts required
- policy diff summary
- schema/interface compatibility note
- rollback plan

### CP3: Release Readiness Check
Trigger
- Objective-bundle milestone integration candidate ready for merge/push.

Required human review
- Confirm review-gates pass.
- Confirm no unresolved blocker risks.

Artifacts required
- gate pass report
- risk register delta
- final merge summary

## Autonomous Zones (No Manual Checkpoint Needed)
- low-risk docs-only corrections
- additive non-breaking telemetry fields with no policy change
- test-only tasks without policy/scope impact

## Escalation Rules
- If any checkpoint artifact is missing, Integrator must block merge.
- If risk owner is unknown, task returns to Planner as blocked.
- Emergency overrides require explicit owner approval and rollback-ready patch.
