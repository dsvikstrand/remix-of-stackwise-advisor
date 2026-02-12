# Normalization Loop Protocol v1

Status
- [have] Scope: current repo only.
- [have] Canonical direction: `library` naming.
- [have] Compatibility policy: keep `inventory` aliases for DB/API/runtime contracts.

Trigger
- `Run normalization loop protocol v1 for current repo.`

Cycle sections (always in this order)
1. Inspect
- Collect impacted files in current cycle.
- List exact `inventory` usages in scope.
- Mark compatibility boundaries (DB table names, API payload keys, eval ids).

2. Normalize
- Apply canonical `library` wording in cycle scope.
- Keep compatibility aliases where runtime/data contracts still expect `inventory`.
- No schema-breaking changes.

3. Static validation
- `npx tsc --noEmit`
- `npm run build`

4. Targeted smoke
- Run one focused smoke relevant to cycle scope.
- Example: `npm run check:normalization` for naming/alias cycles.

5. Branch
- Pass: continue to next cycle.
- Fail: isolate root cause, apply minimal fix, rerun static validation + targeted smoke.

6. Report and checkpoint
- Report changed files, compatibility guarantees, and test outputs.
- Checkpoint commit per passing cycle.

Cycle queue
- Cycle A: docs + eval/config canonicalization.
- Cycle B: runtime alias normalization (non-breaking).
- Cycle C: compatibility hardening + drift checks.

Done criteria
- All cycles pass strict gate.
- No regressions in YT2BP/API/frontend build.
- Canonical naming improved in scoped layers.
- Compatibility preserved.
