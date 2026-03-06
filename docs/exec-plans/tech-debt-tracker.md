# Tech Debt Tracker

## Open
- [todo] Decide if CI should enforce `docs:refresh-check` + `docs:link-check` on PRs.
- [todo] Add lightweight operator alerting for repeated `STALE_RUNNING_RECOVERY` events in ingestion workers.
- [todo] Evaluate whether refresh endpoint cooldown defaults (`scan=30s`, `generate=120s`) should be environment-tier specific (dev/stage/prod).
- [todo] `P2-A Coverage`: expand regression coverage for source-page subscription enforcement, unlock rollback/refund paths, shared auto-billing semantics, and quota degraded/fail-open behavior.
- [todo] `P2-B Shared Preflight`: centralize reusable preflight checks for auth, duration policy, duplicate classification, wallet reservation, queue backpressure, and intake pause.
- [todo] `P2-C Hygiene`: remove stale docs references, dead route assumptions, and duplicated helper logic after the shared preflight refactor settles.

## Closed
- [have] Legacy doc migration and deprecated stub cleanup completed (canonical docs + active/completed registry stabilized).
