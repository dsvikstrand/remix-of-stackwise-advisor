# Eval Harness Contract (Executable Spec)

Purpose: define deterministic evaluation behavior for channel candidate decisions.

## Gate Execution Order
1. `channel_fit`
2. `quality`
3. `safety`
4. `pii`

Execution mode default:
- `all_gates_run` with aggregated decision output.
- This mode is mandatory by default for MVP to maximize auditability.

## Outcome Semantics
- `pass`: no block contribution.
- `warn`: selected-mode manual review route for allowed gate classes.
- `block`: terminal reject contribution for channel publish.

## Threshold Policies
- low-confidence in `channel_fit` or `quality` -> block by default in MVP.
- safety warn treated as block until override policy explicitly changes.
- pii warn treated as block until redaction/remix resolves issue.

## Unified Decision Envelope
All evaluator responses and logs should conform to the unified envelope:
- `ok`
- `error_code`
- `message`
- `data`
- optional `meta`

Example (reject)
```json
{
  "ok": true,
  "error_code": null,
  "message": "candidate evaluated",
  "data": {
    "candidate_id": "cand_789",
    "policy_version": "bleuv1-gate-policy-v1.0",
    "decision": "rejected",
    "next_state": "channel_rejected",
    "gates": [
      {
        "gate_id": "quality",
        "outcome": "block",
        "reason_code": "QUALITY_TOO_SHALLOW",
        "score": 0.42,
        "method_version": "quality-v0"
      }
    ]
  },
  "meta": {
    "execution_mode": "all_gates_run",
    "evaluated_at": "2026-02-15T00:00:00Z"
  }
}
```

## Fail-Closed Rules
1. Missing policy config for mandatory gate -> reject with `POLICY_CONFIG_MISSING`.
2. Evaluator provider failure for safety/pii -> reject with fail-closed reason.
3. Timeout in mandatory gate -> reject with `EVAL_TIMEOUT` unless explicit safe fallback is approved.

## Evidence Requirements
- each gate writes method/version metadata
- decision includes normalized reason codes
- evaluator stores audit timestamp and candidate id
- envelope fields are always present (with `null` where applicable)

## Evaluator Pass Criteria
1. Decision envelope schema valid.
2. Reason codes are in taxonomy.
3. Outcome complies with policy class behavior.
4. Lifecycle result matches state-machine contract.
5. all-gates-run mode recorded in decision metadata.

## Not Implemented Yet
This harness defines execution behavior for build phase; runtime parity must be verified per task.
