# Agentic Seed System (ASS) – Stage 0 Spec

## Goal
Create a **linear, debuggable** seeding pipeline that produces a library and multiple blueprint variants, **without** writing to the database. Outputs are saved as JSON files for inspection.

## Stage 0 Scope (Linear Graph)
1. **lib_gen** → Generate a library schema (categories + items) from a seed topic.
2. **bp_gen** → Generate multiple blueprint variants from that library (steps + items + context).
3. (Optional) **review** + **banner** are **not** part of Stage 0.

## Inputs
`seed/seed_spec_v0.json`

```json
{
  "run_id": "example-run",
  "library": {
    "topic": "...",
    "title": "...",
    "description": "...",
    "notes": "...",
    "tags": ["..."]
  },
  "blueprints": [
    {
      "title": "...",
      "description": "...",
      "notes": "...",
      "tags": ["..."]
    }
  ]
}
```

## Outputs
Saved under `seed/outputs/<run_id>/`:
- `library.json`
- `blueprint_1.json`, `blueprint_2.json`, ...
- `run_log.json` (inputs + timestamps)

## Validation (Stage 0)
- **Schema validation**: strict JSON shape, no missing keys.
- **Item validation**: blueprint steps can only use items from the library.

## Logging
Each step writes:
- input payload
- output payload
- start/end timestamps
- status

## Next Stages (Roadmap)
- **Stage 1**: Lightweight evals (diversity, length, tag coverage)
- **Stage 2**: Retry policies (1 retry for low quality)
- **Stage 3**: Security + cost guardrails
- **Stage 4**: Optional DB insert
