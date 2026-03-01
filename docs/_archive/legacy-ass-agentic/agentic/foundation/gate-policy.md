# bleuV1 Gate Policy (Spec-Only)

This policy defines channel promotion semantics for imported blueprints. It is a specification target for implementation phase.

## Gate Classes
1. `channel_fit`
- Checks whether candidate belongs to target channel taxonomy.

2. `quality`
- Checks structural and usefulness quality floor for shared distribution.

3. `safety`
- Checks prohibited content classes.

4. `pii`
- Checks potential leakage of sensitive personal information.

## Execution Mode Default
- Default evaluator mode: `all_gates_run`.
- Rationale: produce complete audit evidence for candidate decisions and reduce hidden failure causes.
- Optional future mode: short-circuit mode may be introduced only with explicit policy version bump.

## Threshold Classes
- `pass`: eligible for publish contribution in this gate.
- `warn`: caution requiring selected-mode manual review when allowed by class policy.
- `block`: hard fail for channel publish.

## Class-Specific Policy
`channel_fit`
- `pass`: publish eligible.
- `warn`: route to manual review in selected mode.
- `block`: reject channel publish.

`quality`
- `pass`: publish eligible.
- `warn`: route to manual review in selected mode.
- `block`: reject channel publish.

`safety`
- `pass`: publish eligible.
- `warn`: treat as block for channel until policy override.
- `block`: reject channel publish.

`pii`
- `pass`: publish eligible.
- `warn`: treat as block for channel until redaction/remix resolves issue.
- `block`: reject channel publish.

## Global Decision Rule
- Channel publish requires all mandatory gate classes to avoid `block`.
- Low-confidence candidates are blocked from channel by default in MVP.
- In selected mode, `warn` outcomes in `channel_fit` and `quality` route to `candidate_pending_manual_review`.

## Personal Vs Channel Policy
Explicit lock:
- A candidate may fail channel gates while still remaining valid for My Feed.
- Channel gate failure never implies mandatory personal removal by default.

## Fail Behaviors
On block
1. candidate status -> `failed` then `channel_rejected`
2. persist `reason_code` and gate evidence summary
3. retain item in My Feed

On warn (selected mode)
1. candidate status -> `pending_manual_review`
2. user may choose remix + re-submit

On pass
1. candidate status -> `passed`
2. proceed to channel publish write

## Reason-Code Taxonomy
Channel-fit
- `FIT_MISMATCH_STRONG`
- `FIT_AMBIGUOUS`
- `FIT_LOW_CONFIDENCE`

Quality
- `QUALITY_TOO_SHALLOW`
- `QUALITY_STRUCTURE_FAIL`
- `QUALITY_LOW_CONFIDENCE`

Safety
- `SAFETY_FORBIDDEN_TOPIC`
- `SAFETY_JUDGE_FAIL_CLOSED`

PII
- `PII_HIGH_SIGNAL`
- `PII_MEDIUM_SIGNAL`
- `PII_DETECTION_ERROR_FAIL_CLOSED`

System and process
- `EVAL_TIMEOUT`
- `EVAL_PROVIDER_ERROR`
- `POLICY_CONFIG_MISSING`

## Audit Contract
Each gate decision log must include:
- `candidate_id`
- `gate_id`
- `outcome`
- `reason_code`
- `score` (if applicable)
- `policy_version`
- `method_version`
- `timestamp`

## Policy Versioning
- Version format: `bleuv1-gate-policy-v<major>.<minor>`
- Major version changes require stop-and-inspect checkpoint.
- Minor updates may be rolled with explicit changelog entry.

## Not Implemented Yet
- Automated policy evaluation endpoints and storage model in this exact shape are planned, not guaranteed runtime state today.
