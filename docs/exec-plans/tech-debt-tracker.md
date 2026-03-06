# Tech Debt Tracker

This file is the durable post-launch debt board. Do not track launch-gate `P0/P1` work here.

## Post-Launch Program
- [todo] Decide whether direct URL generation should adopt more of the shared preflight helper surface or remain intentionally separate because it does not use queue admission.
- [todo] Evaluate whether source-page unlock preparation should move more transcript/unlock-state branching behind typed shared helpers without obscuring handler-specific behavior.
- [todo] Audit remaining additive response-bucket shaping for any small helper duplication left outside `server/services/generationPreflight.ts`.

## Long-Tail Debt
- [todo] Decide if CI should enforce `docs:refresh-check` + `docs:link-check` on PRs.
- [todo] Add lightweight operator alerting for repeated `STALE_RUNNING_RECOVERY` events in ingestion workers.
- [todo] Evaluate whether refresh endpoint cooldown defaults (`scan=30s`, `generate=120s`) should be environment-tier specific (dev/stage/prod).

## Closed
- [have] Legacy doc migration and deprecated stub cleanup completed (canonical docs + active/completed registry stabilized).
- [have] `P2-A Coverage` completed with direct regression coverage for source-page policy, unlock rollback/refund, shared auto-billing edge cases, and quota degraded/fail-open behavior.
- [have] `P2-B Shared Preflight` completed with reusable generation/unlock preflight helpers extracted into `server/services/generationPreflight.ts` and adopted by Search, source-page, and subscription-refresh handlers without intentional behavior changes.
- [have] `P2-C Hygiene` completed with MVP planning-surface consolidation and cleanup of obvious route-policy drift.
