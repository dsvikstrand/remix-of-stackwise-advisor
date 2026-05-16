# Oracle/Supabase Ownership Model

Status: `current-session summary`

## Current Model

a1) [have] BLEUP is Oracle-primary with Supabase compatibility residue.

a2) [have] Supabase is still required; this is not a Supabase removal project.

a3) [have] The goal is one normal runtime owner per domain.

a4) [have] Hidden dual-runtime fallback is considered technical debt unless explicitly break-glass/bootstrap and observable.

## Ownership Classes

b1) [have] `Oracle-owned runtime truth`
- Normal product runtime reads/writes should resolve through Oracle-backed state/APIs.

b2) [have] `Supabase-owned runtime truth`
- Supabase intentionally remains owner, for example auth/session.

b3) [have] `Compatibility shadow`
- Supabase rows remain for rollback/FK/history/interop but are not the normal owner.

b4) [have] `Bootstrap-only`
- Supabase can seed Oracle state during migration/startup, but should not be a normal hot runtime path.

b5) [have] `Break-glass only`
- Disabled by default, explicit env needed, logged when used.

b6) [todo] `Delete candidate`
- Legacy/historical surfaces that can be removed after separate cleanup.

## Major Oracle-Owned Or Oracle-Primary Domains

c1) [have] Queue/jobs: Oracle queue ledger is the normal enqueue/claim/lease/retry/terminal/status path.

c2) [have] Feed rows: Oracle feed ledger/product feed are normal feed readers/writers for migrated paths.
- In feed-ledger `primary`, a miss from Oracle `feed_ledger_state` is authoritative for normal runtime existence checks such as user/source feed-row lookup. Supabase `user_feed_items` must not be reread just because Oracle found no row; product feed mirror may be used only as an Oracle-local secondary read.

c3) [have] Source items: Oracle source-item ledger is normal source-item state for hot by-id/by-video lookup paths.

c4) [have] Subscriptions: Oracle subscription ledger owns hot subscription reads and operational checkpoint/error updates in primary.

c5) [have] Unlocks: Oracle unlock ledger owns migrated unlock truth.

c6) [have] Generation state and trace: Oracle state owns migrated variant/run/event paths.

c7) [have] Provider circuits: Oracle provider-circuit state is normal runtime circuit state.

c8) [have] Notifications: Oracle-first for inbox/read/write state, with Supabase retained for push-dispatch compatibility.

c9) [have] Blueprints/profiles: Oracle-backed runtime APIs exist and have removed major browser direct reads/writes.

c10) [have] Blueprint likes: Oracle-backed state/API owns wall/detail/profile like state.

c11) [have] Tags/blueprint tags/tag follows: Oracle state owns normal backend tag-family reads/writes; fallback is fail-closed unless break-glass.

## Supabase-Retained Or Intentionally Mixed Areas

d1) [have] Auth/session.

d2) [have] Storage and edge functions where still active.

d3) [have] Credit wallet/ledger may still have retained Supabase ownership unless a dedicated wallet migration says otherwise.

d4) [have] YouTube OAuth/import/onboarding tables may remain Supabase-owned where intentionally retained.

d5) [have] Source pages/channel-candidate surfaces can still be mixed/retained depending on current code.

d6) [have] Legacy routine/social tables are cleanup candidates, not necessarily Oracle migration critical path.

## Break-Glass Posture

e1) [have] Tag-family Supabase fallback is disabled by default.

e2) [have] Relevant env names:
- `ORACLE_TAG_FAMILY_SUPABASE_BREAK_GLASS_ENABLED`
- `TAG_FAMILY_SUPABASE_BREAK_GLASS_ENABLED`

e3) [have] Expected log marker if used:

```text
[tag_family_supabase_break_glass]
```

e4) [todo] Any break-glass use should be treated as incident evidence, not steady-state architecture.

## Current Active Program

f1) [have] Current root implementation program:

```text
docs/exec-plans/active/oracle-supabase-ownership-closure-program.md
```

f2) [have] Registry:

```text
docs/exec-plans/index.md
```

f3) [todo] Remaining useful governance work:
- ownership allowlist/static guardrail for direct Supabase product-table access
- tail cleanup for residual attribution families
- docs/runbook promotion of final ownership ledger after implementation converges

## How To Evaluate A New Supabase Reference

g1) [todo] Identify actor:
- browser anon/authenticated
- backend service role
- ops script
- test
- migration/bootstrap

g2) [todo] Identify table/domain.

g3) [todo] Classify ownership class from this doc.

g4) [todo] If Oracle-owned normal runtime, prefer backend Oracle-aware API/state.

g5) [todo] If retained Supabase owner, document why.

g6) [todo] If compatibility/break-glass, ensure logs/flags/removal condition exist.

## Current Health Interpretation

h1) [have] Low Supabase egress does not by itself prove clean ownership; attribution must still be classified.

h2) [have] A direct browser product-table request is usually a stronger migration smell than a backend service-role compatibility shadow.

h3) [have] YouTube feed soft failures are a source-health concern, not necessarily a database ownership failure.

h4) [have] Queue/provider health and locked-card arrival should be inspected together after ownership changes.
