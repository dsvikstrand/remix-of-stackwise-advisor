# ASS Eval Config Schema (v2)

This document describes the **ASS eval config v2** format, used by the ASS runner to configure **eval instances per node**.

File example:
- `seed/ass_eval_config_v2.example.json`

Runner flag:
- `--ass-eval-config <path>`

## Core Idea

- **Eval class**: a reusable implementation (example: `structural_inventory`).
- **Eval instance**: a configured use of an eval class on a specific node (example: run `structural_inventory` on `LIB_GEN`).

## Top-Level Shape

```json
{
  "version": 2,
  "unknown_eval_policy": "hard_fail",
  "nodes": {
    "LIB_GEN": { "evals": [ { "eval_id": "structural_inventory" } ] }
  }
}
```

## Fields

- `version`: must be `2`.
- `unknown_eval_policy`: how to handle an `eval_id` that is not registered.
  - `hard_fail` (recommended for seeding)
  - `warn` (record a warning gate, allow candidate to proceed)
  - `skip` (ignore the instance)
- `nodes`: object keyed by node id, each with:
  - `evals`: array of eval instances

## Eval Instance

Each item in `nodes.<NODE>.evals[]`:

- `eval_id` (required): string id of the eval class.
- `params` (optional): object passed to the eval class.
- `severity` (optional): `info|warn|hard_fail` override for failed results only.
- `score_weight` (optional): number used when computing candidate score (default: `1`).
- `retry_budget` (optional): reserved for future use (not enforced in v2 wiring yet).

## Node Ids (Current)

Common nodes you will configure:
- `CONTROL_PACK`
- `PROMPT_PACK`
- `LIB_GEN`
- `BP_GEN`

