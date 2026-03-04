# bleuV1 Risk Register

## Purpose
Track top MVP risks with owner, mitigation, and stop-and-inspect triggers.

## Risk Classes
- operational
- legal-policy
- quality
- ux-trust

## Playbook Links
- Runtime incident baseline: `docs/ops/yt2bp_runbook.md`
- Program tracker: `docs/exec-plans/active/on-pause/project-bleuv1-mvp-foundation.md`
- Gate rules: `docs/_archive/legacy-ass-agentic/agentic/foundation/gate-policy.md`

## Active Risks

### R1: Ingestion Reliability Degrades
- Class: operational
- Owner: backend
- Description: Source pulls fail too often due to provider or quota instability.
- Signal: drop in ingest success, repeated `timeout/rate_limited` errors.
- Mitigation: bounded retries, backoff, queue protection, fallback mode.
- Stop trigger: ingest success under threshold for consecutive windows.
- Response playbook: runbook triage + temporary ingestion throttles.

### R2: Channel Pollution From Weak Fit
- Class: quality
- Owner: product + eval
- Description: Misrouted candidates reduce channel trust.
- Signal: high channel-fit reject rate, user hide/report spikes.
- Mitigation: conservative channel-fit thresholds, manual review for warns.
- Stop trigger: reject or complaint rates breach agreed threshold.
- Response playbook: tighten fit policy version and review mapping taxonomy.

### R3: Unsafe Or Sensitive Content Leakage
- Class: legal-policy
- Owner: eval + backend
- Description: Safety/PII misses produce harmful channel publication.
- Signal: post-publication flags, audit findings, high-severity reports.
- Mitigation: fail-closed behavior for safety/PII uncertainties.
- Stop trigger: any high-severity incident in shared channels.
- Response playbook: immediate publish freeze, retroactive unpublish, gate patch.

### R4: Identity Drift To Generic Posting App
- Class: ux-trust
- Owner: product
- Description: Users perceive app as generic posting tool, not source-first blueprint app.
- Signal: docs/IA language regresses, standalone-post requests become default path.
- Mitigation: enforce scope contract and glossary in active docs.
- Stop trigger: canonical docs or active plans present conflicting primary identity.
- Response playbook: contradiction audit and docs correction before further implementation.

### R5: Duplicate Cost Explosion
- Class: operational
- Owner: backend
- Description: Same source regenerated repeatedly across users, raising latency and cost.
- Signal: low cache hit rate and duplicate generation spikes.
- Mitigation: canonical source keys + artifact cache keyed by pipeline version.
- Stop trigger: cache hit below threshold for repeated source pulls.
- Response playbook: cache-key audit and idempotency fixes.

### R6: Over-Autonomous Changes Without Human Checkpoint
- Class: legal-policy + ux-trust
- Owner: release manager
- Description: Agent loop bypasses intended review for high-risk changes.
- Signal: schema/auth/safety policy changes merged without stop-and-inspect notes.
- Mitigation: fixed checkpoint policy with merge gate requirement.
- Stop trigger: any high-risk merge without checkpoint evidence.
- Response playbook: rollback to prior tag and patch governance workflow.

## Stop-And-Inspect Trigger Matrix
1. schema/auth boundary change -> mandatory checkpoint.
2. safety or PII threshold/policy version change -> mandatory checkpoint.
3. release to shared channel automation path change -> mandatory checkpoint.

## Maintenance Rules
- Risk entries must include owner and trigger.
- Mitigation updates must be versioned in active plan logs.
- Closed risks move to completed plan notes with closure date.
