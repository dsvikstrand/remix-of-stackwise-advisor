# Review Gates (Integration Minimum)

Purpose: define non-negotiable checks before integration.

## Mandatory Gates (All Tasks)
1. Docs governance
- `npm run docs:refresh-check -- --json`
- `npm run docs:link-check`

2. Task acceptance
- all `acceptance_tests` listed in task artifact pass

3. Contract traceability
- change references at least one foundation and one executable contract where relevant

4. Policy compliance
- no violation of decision matrix defaults
- no checkpoint-bypass for required triggers

## Mandatory Code Baseline (Code-Changing Tasks)
1. Always required
- `npm run lint`
- `npm run test`

2. Conditionally required build
Run `npm run build` when touched changes include any of:
- routing/navigation
- shared components/layout primitives
- type-heavy refactors
- publish/auth/data flow paths

## Conditional Domain Gates
- Smoke checks for ingest/gate pipeline when backend ingestion/candidate paths change
- Metrics script sanity when telemetry interfaces change

## Fail Conditions
- missing rollback for required task classes
- unresolved blocking risk from risk-register owner
- ambiguous terminology violating terminology-rules
- missing mandatory code baseline for code-changing tasks

## Integrator Output Format
- `task_id`
- gate result summary
- checkpoint status (`not_required|cp1_ok|cp2_ok|cp3_ok`)
- merge decision (`approved|blocked`)
- blocker list (if blocked)
