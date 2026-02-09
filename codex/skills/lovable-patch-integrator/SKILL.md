---
name: lovable-patch-integrator
description: Apply and batch Lovable unified-diff patches onto the `lovable-updates` branch only. Use for the daily "Lovable credits" workflow: apply patch, run build gate, commit, push. Never merge to `main`.
---

# Lovable Patch Integrator

## Purpose
This skill exists to keep Lovable work low-risk and low-interruption while the main focus stays on DAS.

Lovable outputs **unified diff patches** in chat. This skill applies those patches to the `lovable-updates` branch, runs a fast build gate, commits, and pushes. It does **not** merge into `main`.

## Source Of Truth
- Policy + batching rules live in `.lovable/plan.md`.

## Hard Guardrails
- Only operate on branch `lovable-updates`.
- Do not merge to `main` (ever).
- Do not commit secrets or tokens.
- Treat each Lovable patch as "mechanical refactor unless explicitly requested".
- Keep patch batching small (default: max 3 patches/day).

## Workflow (Daily Batch)
1. Read `.lovable/plan.md` to confirm today's patch policy and invariants.
2. Switch to `lovable-updates` and sync from upstream.
3. For each patch in today's batch:
   - Apply patch
   - Run `npm run build`
   - Commit with a message that references "Lovable patch" and the patch topic
4. Push `lovable-updates` to `upstream`.
5. Report what was applied and whether the build gate passed.

## How To Apply A Patch
Preferred: paste the patch into a file and apply with `git apply`.

If the patch was pasted in chat, create a temporary file and apply it.

## References
- Daily commands + conflict playbook: `references/daily_workflow.md`
- Fixed smoke checklist (branch-only): `references/smoke_checklist.md`
- Invariants that must not regress: `references/invariants.md`
- Prompt to send Lovable: `references/lovable_prompt.md`

