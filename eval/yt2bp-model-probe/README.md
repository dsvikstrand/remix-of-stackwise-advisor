# YT2BP Model Probe

*Isolated probe harness for testing blueprint-generation models without touching the production pipeline.*

This folder is for model experiments around the one-step YouTube blueprint prompt. It reuses the same prompt builder and the same JSON/schema guard used by the app, but runs as a separate eval harness.

## What It Covers

- Export `8-9` stored transcripts from Supabase into a local-only case file
- Run a quality pass on those transcripts with `gpt-5.4-mini + flex`
- Run a smaller latency comparison on `1-2` cases with:
  - `gpt-5.4-mini` standard
  - `gpt-5.4-mini + flex`
- Save raw model output, parsed JSON, and a summary report under `output/`

## Files

- `fetchCases.ts`
  Pulls stored transcripts from `youtube_transcript_cache` and writes `cases.local.json`
- `runProbe.ts`
  Runs the actual model probe and writes per-run artifacts to `output/<run_id>/`
- `shared.ts`
  Small local helpers for env loading, file output, and shared types

## Local-Only Data

The raw eval dataset is intentionally not committed.

- `cases.local.json` is ignored by git
- `output/` is ignored by git

That keeps the harness code in the repo while leaving the pulled transcripts and raw model responses local.

## Typical Workflow

### 1. Export a mixed transcript set

```bash
npm run probe:yt2bp:cases -- \
  --count 9 \
  --include-video wJf1MVJ2z_k \
  --include-video ojAjUKcx7p4 \
  --include-video nPdPEiLdpdA
```

This writes:

- `eval/yt2bp-model-probe/cases.local.json`

### 2. Run the quality set on `gpt-5.4-mini + flex`

```bash
npm run probe:yt2bp -- \
  --mode quality-set \
  --model gpt-5.4-mini \
  --service-tier flex \
  --attempts 2
```

This runs the production-style retry loop:

- first pass with the normal prompt
- second pass with a strict JSON retry instruction if the first output is invalid

### 3. Run the small latency comparison

```bash
npm run probe:yt2bp -- \
  --mode latency-pair \
  --model gpt-5.4-mini \
  --case-ids case_01_wJf1MVJ2z_k,case_02_ojAjUKcx7p4
```

This compares:

- `standard` (no service tier override)
- `flex`

on the same fixed prompts.

## Output Shape

Each probe run writes to:

- `eval/yt2bp-model-probe/output/<run_id>/`

Inside each run directory:

- `summary.json`
- one subfolder per case
- raw response text for each attempt
- parsed JSON for valid outputs
- small error JSON for invalid outputs

## Notes

- The prompt is intentionally kept fixed during a given experiment
- The harness uses the same prompt template and JSON/schema validator as production
- The local probe points POS references at the repo-local `docs/golden_blueprint/reddit/clean/pos`
- This is for isolated eval only; it does not change the live backend model config
