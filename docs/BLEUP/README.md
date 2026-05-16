# BLEUP Onboarding Pack

Status: `current-session onboarding`
Audience: new Codex sessions, maintainers, launch/support collaborators

## Purpose

This folder is a fast-start map for understanding BLEUP without reading every historical plan. It summarizes the current app, runtime, ops model, and Oracle/Supabase ownership migration, then links back to canonical docs for detail.

Do not treat this folder as a replacement for canonical runtime truth. If this pack conflicts with canonical docs, follow the canonical docs and update this pack.

## Fast Read Order

a1) [have] Start here:
- `docs/BLEUP/context/new-session-brief.md`

a2) [have] Product and UX:
- `docs/BLEUP/product/ux-positioning.md`
- `docs/BLEUP/product/routes-and-surfaces.md`
- canonical product lock: `docs/app/core-direction-lock.md`
- canonical product spec: `docs/app/product-spec.md`

a3) [have] Codebase:
- `docs/BLEUP/engineering/local-repo-guide.md`
- `docs/BLEUP/engineering/code-map.md`
- root README: `README.md`

a4) [have] Production operations:
- `docs/BLEUP/ops/oracle-backend.md`
- `docs/BLEUP/ops/supabase.md`
- `docs/BLEUP/ops/health-check-playbook.md`
- canonical runbook: `docs/ops/yt2bp_runbook.md`

a5) [have] Oracle/Supabase migration:
- `docs/BLEUP/ops/oracle-supabase-ownership.md`
- active plan registry: `docs/exec-plans/index.md`
- active ownership program: `docs/exec-plans/active/oracle-supabase-ownership-closure-program.md`

a6) [have] Terminology:
- `docs/BLEUP/context/glossary.md`

## How To Use This Pack

b1) [have] For a new Codex session, read `context/new-session-brief.md` first.

b2) [have] For product or launch work, read `product/ux-positioning.md` and `product/routes-and-surfaces.md`.

b3) [have] For debugging or implementation, read `engineering/local-repo-guide.md`, `engineering/code-map.md`, and then inspect current code.

b4) [have] For production checks, use `ops/health-check-playbook.md` before making conclusions.

b5) [have] For database/backend ownership questions, use `ops/oracle-supabase-ownership.md` and verify against current code/live health.

## Freshness Rules

c1) [todo] Update this folder when a change affects product identity, major routes, deploy/runbook flow, Oracle/Supabase ownership, or new-session working assumptions.

c2) [todo] Run docs checks after updates:

```bash
npm run docs:refresh-check -- --json
npm run docs:link-check
```

c3) [have] Historical plans in `docs/exec-plans/completed`, `docs/exec-plans/deserted`, and `docs/_archive` are reference-only unless the plan registry says otherwise.
