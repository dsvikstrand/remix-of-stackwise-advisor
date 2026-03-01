# State Machine Test Contract

Purpose: convert lifecycle semantics into deterministic evaluator checks.

## Lifecycle Under Test
`source_item -> imported_blueprint -> my_feed -> channel_candidate -> channel_published|channel_rejected`

## Scenario Matrix

### Valid Path Scenarios
1. Happy path publish
- Given valid source and all mandatory gates pass
- Expect terminal state `channel_published`

2. Personal-only reject path
- Given at least one mandatory gate block outcome
- Expect terminal state `channel_rejected`
- Expect My Feed item retained

3. Warn/manual review path (selected mode)
- Given warn in `channel_fit` and/or `quality` with no blocks
- Expect transition to `candidate_pending_manual_review`
- Expect explicit user action before publish/reject terminal state

4. Manual review re-submit path
- Given `candidate_pending_manual_review` and user remix/re-submit
- Expect transition back to `candidate_submitted` then re-evaluation

### Invalid Transition Scenarios
1. Direct publish bypass
- Attempt `my_feed_published -> channel_published` without candidate evaluation
- Must fail with transition error

2. Pending-review direct publish
- Attempt `candidate_pending_manual_review -> channel_published` without pass evaluation record
- Must fail

3. Reject to publish without re-eval
- Attempt `channel_rejected -> channel_published` without override/re-eval record
- Must fail

### Retry Scenarios
1. Transient ingestion failure
- timeout/network during normalization
- bounded retry should continue or end with explicit error state

2. Hard policy block
- safety/pii hard fail
- no automatic publish retry allowed

## Required Assertions
- each transition emits auditable status entry
- terminal states are unique and deterministic
- invalid transitions generate explicit reason code
- candidate failure does not auto-remove personal access
- warn routing in selected mode lands in explicit pending manual review state

## Test Artifact Format (Example)
```json
{
  "scenario_id": "SM-WARN-001",
  "start_state": "candidate_submitted",
  "inputs": {
    "gate_results": [
      { "gate_id": "channel_fit", "outcome": "warn", "reason_code": "FIT_AMBIGUOUS" },
      { "gate_id": "quality", "outcome": "pass", "reason_code": "" },
      { "gate_id": "safety", "outcome": "pass", "reason_code": "" },
      { "gate_id": "pii", "outcome": "pass", "reason_code": "" }
    ]
  },
  "expected": {
    "transition_state": "candidate_pending_manual_review",
    "terminal_state": null,
    "reason_codes": ["FIT_AMBIGUOUS"]
  }
}
```
