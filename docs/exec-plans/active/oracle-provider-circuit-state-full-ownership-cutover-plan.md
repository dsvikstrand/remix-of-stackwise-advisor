# Oracle Provider Circuit State Full Ownership Cutover Plan

Status: `active`
Owner: `Codex / David`
Last updated: `2026-04-15`

## Purpose

Make Oracle the only normal operational `provider_circuit_state` system for Bleup within the current 48h migration window.

This is a quick full-ownership chapter, not a broad product-data migration. The explicit end state is:
- Oracle owns normal runtime `provider_circuit_state`
- Supabase `provider_circuit_state` stops participating in normal runtime behavior
- no normal provider circuit read/write path should depend on Supabase
- any remaining Supabase `provider_circuit_state` usage becomes migration residue only

This chapter is intentionally prioritized ahead of broader remaining families because it is:
- backend-only
- narrow
- low blast radius relative to `tags`, `channel_candidates`, and `notifications`

## Explicit End State

a1) [todo] Oracle is the sole normal operational `provider_circuit_state` truth in runtime.

a2) [todo] Normal runtime provider circuit behavior no longer depends on Supabase for:
- provider circuit row reads
- provider circuit row upserts
- fail-fast availability checks
- provider health/ops state exposure

a3) [todo] Provider fail-fast and cooldown behavior remains correct through burn-in.

a4) [todo] Supabase `provider_circuit_state` stops doing normal runtime work; any residue is manual/historical only.

## Why This Plan Exists

b1) [have] The latest sampled 24h Supabase attribution on `2026-04-15` shows:
- `provider_circuit_state` `11.1%`
- `POST /rest/v1/provider_circuit_state` `8.9%`

b2) [have] That is materially large enough to justify a dedicated migration.

b3) [have] This family is currently the safest aggressive migration in the 48h window because:
- the core logic is concentrated in one backend service
- there are no direct browser/runtime reads or writes to this table
- the user-facing blast radius is lower than the other leading families

## Current State

c1) [have] The main Supabase-owned seams are concentrated in:
- [providerCircuit.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/providerCircuit.ts)

c2) [have] Current runtime behaviors on Supabase are:
- `getCircuitRow(...)`
- `upsertCircuitRow(...)`
- `assertProviderAvailable(...)`
- `recordProviderSuccess(...)`
- `recordProviderFailure(...)`
- `getProviderCircuitSnapshot(...)`

c3) [have] Operational readout exposure is currently visible through:
- [opsHandlers.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/handlers/opsHandlers.ts)
- [index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)

c4) [have] The only normal runtime caller path is:
- [providerResilience.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/providerResilience.ts)
  - `runWithProviderRetry(...)` gates every provider call through:
    - `assertProviderAvailable(...)`
    - `recordProviderSuccess(...)`
    - `recordProviderFailure(...)`

c5) [have] The only diagnostic read path is the queue/ops health surface:
- [opsHandlers.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/handlers/opsHandlers.ts)
  - `handleQueueHealth(...)` calls `getProviderCircuitSnapshot(...)` for transcript and LLM provider keys
- [index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)
  - wires `getProviderCircuitSnapshot` into the ops route deps

c6) [have] This domain does not appear to have direct browser/product residue.

c7) [have] This domain does not appear to need a bootstrap-heavy phase.
- rows are keyed by `provider_key`
- behavior is mutable runtime state, not a large catalog

## Scope Lock

d1) [todo] This plan is `provider_circuit_state` only.

d2) [todo] Do not mix `channel_candidates`, `notifications`, `tags`, or broader provider/transcript refactors into this chapter except where provider circuit state is a hard dependency.

d3) [todo] Focus on:
- provider circuit reads
- provider circuit writes
- ops/health readouts that expose the state

## Main Files / Surfaces

e1) [have] Primary runtime seams:
- [server/services/providerCircuit.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/providerCircuit.ts)
- [server/handlers/opsHandlers.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/handlers/opsHandlers.ts)
- [server/index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)

e2) [todo] Likely Oracle storage seams to add/update:
- [server/services/oracleControlPlaneDb.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/oracleControlPlaneDb.ts)
- new Oracle provider-circuit state helper near other Oracle control-plane services

e3) [have] Primary regression coverage targets:
- [src/test/providerResilience.test.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/test/providerResilience.test.ts)
- [src/test/opsHandlers.test.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/test/opsHandlers.test.ts)

## 48h Cutover Shape

f1) [have] Phase 0: One fast inventory and seam confirmation
f2) [have] Phase 1: Oracle-only provider circuit writes
f3) [have] Phase 2: Oracle-only provider circuit reads
f4) [todo] Phase 3: Short burn-in / canary
f5) [todo] Phase 4: Cleanup and closure

## Phase 0: One Fast Inventory

g1) [have] Confirmed `provider_circuit_state` touchpoints and classified them as:
- runtime write
- runtime read
- ops/diagnostic read
- removable residue

g2) [have] No hidden dependency was found outside:
- [providerCircuit.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/providerCircuit.ts)
- [opsHandlers.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/handlers/opsHandlers.ts)
- [index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)
- [providerResilience.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/providerResilience.ts)

g3) [have] Inventory output:
- runtime writes:
  - `recordProviderSuccess(...)`
  - `recordProviderFailure(...)`
  - half-open transition inside `assertProviderAvailable(...)`
- runtime reads:
  - `getCircuitRow(...)` inside `assertProviderAvailable(...)`
- ops/diagnostic reads:
  - `getProviderCircuitSnapshot(...)` inside `handleQueueHealth(...)`
- browser/product residue:
  - none found
- bootstrap/catalog concern:
  - none found

g4) [have] Exact first implementation wave:
- **Provider Circuit State Pass 1: Oracle-Only Writes**
  - move `upsertCircuitRow(...)` and all write-side transitions onto Oracle-backed control-plane state
  - keep read-side lookup on Supabase for one pass only

g5) [have] Exact second implementation wave:
- **Provider Circuit State Pass 2: Oracle-Only Reads**
  - move `getCircuitRow(...)` and `getProviderCircuitSnapshot(...)` onto Oracle-backed state
  - keep fail-fast timing and ops payload shape unchanged

## Phase 1: Oracle-Only Provider Circuit Writes

h1) [have] Replaced Supabase-backed `provider_circuit_state` upserts with Oracle-backed state writes.

h2) [have] Kept caller behavior stable while changing only the write owner.

h3) [have] After this phase, Supabase no longer matters to normal runtime provider circuit write correctness.

h4) [have] Landed in this wave:
- Oracle control-plane now has a dedicated `provider_circuit_state` table
- write-side provider circuit transitions now persist to Oracle-backed state
- caller behavior in [providerResilience.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/providerResilience.ts) stayed unchanged
- read-side lookup and ops snapshots remain on Supabase for this pass only

h5) [have] Primary code seams for Pass 1:
- [server/services/oracleControlPlaneDb.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/oracleControlPlaneDb.ts)
- [server/services/oracleProviderCircuitState.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/oracleProviderCircuitState.ts)
- [server/services/providerCircuit.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/providerCircuit.ts)
- [server/index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)

h6) [have] Regression coverage added for Pass 1:
- [src/test/oracleProviderCircuitState.test.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/test/oracleProviderCircuitState.test.ts)
- [src/test/providerCircuit.test.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/test/providerCircuit.test.ts)

## Phase 2: Oracle-Only Provider Circuit Reads

i1) [have] Replaced Supabase-backed `provider_circuit_state` reads with Oracle-backed state reads.

i2) [have] Kept fail-fast behavior and cooldown timing unchanged.

i3) [have] Moved ops/provider circuit snapshots onto Oracle-backed state.

i4) [have] After this phase, Supabase no longer matters to normal runtime provider circuit read correctness.

i5) [have] Landed in this wave:
- `getCircuitRow(...)` now resolves through the Oracle-backed adapter when control-plane runtime is enabled
- `assertProviderAvailable(...)` now enforces fail-fast from Oracle-backed circuit rows without requiring a Supabase client
- `getProviderCircuitSnapshot(...)` now exposes Oracle-backed provider circuit rows to ops/queue-health
- ordinary Oracle misses no longer trigger hidden Supabase rereads in the normal runtime path

i6) [have] Primary code seams for Pass 2:
- [server/services/providerCircuit.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/providerCircuit.ts)
- [server/index.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/index.ts)
- [server/handlers/opsHandlers.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/handlers/opsHandlers.ts)

i7) [have] Regression coverage now includes the Oracle-backed read path:
- [src/test/providerCircuit.test.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/test/providerCircuit.test.ts)
- [src/test/opsHandlers.test.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/src/test/opsHandlers.test.ts)

## Phase 3: Short Burn-In / Canary

j1) [todo] Validate Oracle-only provider circuit behavior under:
- normal provider success
- repeated provider failures
- cooldown-open behavior
- half-open recovery
- ops/provider state inspection

j2) [todo] Required burn-in target:
- provider failures still open the circuit correctly
- cooldown windows still enforce fail-fast correctly
- successful recovery still closes the circuit correctly
- no hidden Supabase dependency resurfaces
- Supabase `provider_circuit_state` egress drops materially

## Phase 4: Cleanup And Closure

k1) [todo] Remove remaining meaningful Supabase `provider_circuit_state` compatibility residue from active runtime surfaces and sync canonical docs to the final Oracle-owned posture.

k2) [todo] Move this plan to `completed/` once:
- Supabase `provider_circuit_state` runtime work is zero or negligible
- no hidden dependency remains
- burn-in evidence is accepted

## Proof Gates

l1) [todo] Required proof before declaring `provider_circuit_state` cutover complete:
- Oracle primary/runtime health green
- provider fail-fast behavior still works
- provider recovery still works
- ops/provider snapshots still return expected state

l2) [todo] Required proof before closing the chapter:
- at least one meaningful burn-in window
- no unresolved provider-circuit correctness regressions
- Supabase attribution shows `provider_circuit_state` materially reduced

## Rollback Rules

m1) [todo] Prefer fix-forward over restoring dual-state provider circuit runtime.

m2) [todo] Any emergency rollback should be an explicit code/env change, not a hidden long-lived compatibility path.

## Success Criteria

n1) [todo] Oracle fully owns normal `provider_circuit_state` operations in runtime.

n2) [todo] Supabase `provider_circuit_state` no longer does normal runtime work.

n3) [todo] Provider fail-fast, cooldown, and recovery behavior remain correct through burn-in.
