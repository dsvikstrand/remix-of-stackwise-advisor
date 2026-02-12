# Eval Scorecard (v0)

Purpose: store the output of an LLM judge run as a stable artifact, so regression-style evals can compare future generations against a known baseline.

Suggested location (method-owned)
- `eval/methods/v0/<eval_id>/artifacts/golden_scores/<domain_id>/<fixture_id>.score_v0.json`

Linkage fields (required to prevent stale baselines)
- `eval_id`: string (example: `llm_golden_regression_library_v0`)
- `golden_fixture_path`: string (repo-relative path to the golden fixture JSON)

Required fields
- `version`: 0
- `eval_id`: string
- `domain_id`: string
- `golden_fixture_id`: string (fixture file name without path)
- `golden_fixture_path`: string
- `golden_fixture_hash`: string (sha256 of the golden fixture JSON bytes)
- `judge_model`: string
- `prompt_version`: string
- `scale`: `{ "min": number, "max": number }` (example: 0..10)
- `criteria`: array of `{ "id": string, "text": string, "max_drop": number }`
- `scores`: array of `{ "id": string, "score": number }` (same ids as `criteria`)
- `overall`: number
- `createdAt`: ISO timestamp

Notes
- A scorecard is only valid for the exact `(judge_model, prompt_version, golden_fixture_hash, criteria)` combination.
- If any of those inputs change, generate a new scorecard intentionally (do not overwrite silently).
