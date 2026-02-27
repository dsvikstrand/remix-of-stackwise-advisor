# Golden Blueprint Workspace

This folder is the working area for building and validating the Golden BP generation pipeline.

## Canonical Docs

- Prompt/spec source of truth: `golden_bp_prompt_contract_v1.md`
- Historical baseline protocol: `golden_bp_protocol_v0.md`
- Layout scaffolds: `golden_bp_layouts_v0.md`
- Reddit signal analysis: `reddit_pos_neg_insights.md`

## Structure

- `reddit/clean/pos`: cleaned positive reference posts
- `reddit/clean/neg`: cleaned negative/low-impact reference posts
- `reddit/raw/pos`: raw source captures for positives + cleanup report
- `reddit/raw/neg`: raw source captures for negatives + cleanup report
- `reddit/manual_check/pos`: files needing manual OP-only reconstruction
- `reddit/manual_check/neg`: negative files needing manual review

## Notes

- Use `clean/*` as the main reference set for pattern extraction.
- Use `raw/*` only for traceability and recovery.
- Keep unresolved edge-cases in `manual_check/*` and exclude them from scoring runs until fixed.
