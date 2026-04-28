# Oracle Release And Deploy Hardening Plan

Status: `active`
Owner: `Codex / David`
Last updated: `2026-04-28`

## Purpose

Make the production release path complete, repeatable, and safe.

The immediate production incident was simple: live systemd services expected `dist/server/index.mjs`, but the normal `npm run build` command only built the Vite frontend and removed the server artifact. Production was restored by manually rebuilding the server bundle, but that is not an acceptable deploy contract.

This plan is not a small patch. The goal is to make deployment a reliable product capability:
- release builds always produce all artifacts production needs
- deploys validate artifacts before restart
- service topology is verified against runtime truth
- failed deploys stop before damaging production, or roll back automatically after failed health checks
- docs, CI, and operator commands all describe the same release flow

## Explicit End State

a1) [todo] `npm run build:release` produces a complete deployable artifact set:
- frontend assets
- `dist/server/index.mjs`
- release metadata

a2) [todo] `npm run verify:release-artifact` fails loudly if any production-required artifact is missing or inconsistent.

a3) [todo] Oracle deploys no longer restart services until the new artifact has passed local validation on the server.

a4) [todo] Oracle deploys verify actual systemd topology before restart:
- `agentic-backend.service`
- `agentic-worker.service`
- Node `20.20.0`
- `/etc/agentic-backend.env`
- expected runtime entrypoint path

a5) [todo] Failed post-restart health checks trigger a safe rollback or leave services on the previous known-good release.

a6) [todo] CI validates the release build contract so missing server artifacts are caught before a commit reaches deployment.

a7) [todo] Ops docs and architecture docs match live runtime truth.

a8) [todo] The deploy path remains fast enough for normal iteration and does not introduce unnecessary runtime overhead.

## Why This Plan Exists

b1) [have] Production currently runs compiled server artifacts from:
- `dist/server/index.mjs`

b2) [have] The current `build` script is frontend-only:
- `vite build`

b3) [have] A frontend build can remove the existing server artifact while still reporting a successful build.

b4) [have] That creates a dangerous failure mode:
- deploy pulls code
- build succeeds
- services restart
- Node cannot find `dist/server/index.mjs`
- backend/worker crash loop until manual recovery

b5) [have] Manual one-off `npx esbuild server/index.ts ...` proved the artifact can be produced, but it is not a durable release process.

b6) [have] Current docs contain service-topology drift: some docs still describe a single backend service / deferred worker, while live production now runs split backend and worker services.

## Scope Lock

c1) [todo] This chapter covers release build, artifact validation, Oracle deployment, rollback, CI release gates, and ops documentation.

c2) [todo] It may touch:
- package scripts
- release/deploy scripts
- GitHub Actions
- ops docs
- architecture docs
- deploy smoke checks

c3) [todo] It should not change product behavior, queue semantics, generation semantics, Oracle ownership logic, or frontend UX unless a release-safety dependency requires a tiny supporting change.

c4) [todo] It should not hide failing checks. If the deploy cannot prove safety, it must stop before restart.

## Main Runtime And Release Seams

d1) [todo] Build scripts:
- [package.json](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/package.json)
- [scripts/with-node20.sh](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/scripts/with-node20.sh)

d2) [todo] New release scripts:
- `scripts/build_server.mjs`
- `scripts/verify_release_artifact.mjs`
- `scripts/deploy_oracle_release.mjs`

d3) [todo] CI gates:
- [.github/workflows/ci.yml](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/.github/workflows/ci.yml)

d4) [todo] Canonical docs:
- [docs/architecture.md](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/docs/architecture.md)
- [docs/ops/yt2bp_runbook.md](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/docs/ops/yt2bp_runbook.md)
- [docs/ops/mvp-launch-readiness-checklist.md](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/docs/ops/mvp-launch-readiness-checklist.md)

d5) [todo] Production verification:
- Oracle SSH alias `oracle-free`
- repo path `/home/ubuntu/remix-of-stackwise-advisor`
- services `agentic-backend.service` and `agentic-worker.service`
- health endpoint `/api/health`
- queue health endpoint `/api/ops/queue/health`

## Current State

e1) [have] Local package scripts include `build`, but not a release build that includes the server bundle.

e2) [have] Production systemd services currently expect compiled runtime:
- `/home/ubuntu/remix-of-stackwise-advisor/dist/server/index.mjs`

e3) [have] Live production was restored by manually running an esbuild command on Oracle.

e4) [have] The current deploy procedure relies on operator knowledge instead of a single checked release command.

e5) [have] Runtime health is currently green, so this hardening can be implemented without emergency pressure.

## Release Contract

f1) [have] Add `build:client`:
- runs the current Vite frontend build
- keeps client build behavior explicit

f2) [have] Add `build:server`:
- bundles `server/index.ts` into `dist/server/index.mjs`
- uses Node platform and ESM output
- keeps external packages external where appropriate
- does not depend on ad-hoc network-installed `npx` packages

f3) [have] Add `build:release`:
- runs client build
- runs server build
- writes release metadata
- runs artifact verification

f4) [have] Add `verify:release-artifact`:
- validates frontend entry assets
- validates server entrypoint
- validates release metadata
- validates expected file sizes are non-zero
- validates the server entrypoint is loadable enough to catch missing dependencies where feasible without starting production listeners

f5) [have] Preserve `npm run build` compatibility if needed, but make the release path impossible to confuse with frontend-only builds.

## Round 1 Implementation Tracker

n1) [have] Add first-class release package scripts:
- `build:client`
- `build:server`
- `build:release`
- `verify:release-artifact`

n2) [have] Add server bundle builder:
- `scripts/build_server.mjs`

n3) [have] Add artifact verifier:
- `scripts/verify_release_artifact.mjs`

n4) [have] Update CI to run the release build and artifact verifier.

n5) [have] Verify locally:
- `npm run build:release`
- `npm run verify:release-artifact`
- `npm run typecheck`
- `npm run test`
- `npm run docs:link-check`
- `npm run docs:refresh-check -- --json`

## Oracle Deploy Contract

g1) [have] Add `deploy:oracle` as the single operator entrypoint for backend deploys.

g2) [have] Require an exact release SHA or default to the current local `HEAD` with explicit logging.

g3) [have] On Oracle, perform:
- SSH connectivity check
- repo status check
- `git fetch`
- checkout/pull exact SHA
- Node `20.20.0` activation
- dependency install only when required
- `npm run build:release`
- `npm run verify:release-artifact`

g4) [have] Before restart, capture rollback metadata:
- previous SHA
- previous artifact presence
- previous service active states

g5) [have] Restart only after artifact verification passes.

g6) [have] Restart services in a controlled order:
- backend
- worker

g7) [have] Run post-restart checks:
- `systemctl is-active agentic-backend.service agentic-worker.service`
- `curl http://127.0.0.1:8787/api/health`
- queue health with `x-service-token: $INGESTION_SERVICE_TOKEN`

g8) [todo] If post-restart checks fail, attempt rollback to previous SHA and restart services again.

g9) [have] If rollback also fails, print explicit manual recovery commands and stop with a non-zero exit.

## Service Topology Verification

h1) [have] Verify that production services point at the artifact built by the release path.

h2) [have] Verify that both service units use Node `20.20.0`.

h3) [have] Verify that runtime config comes from `/etc/agentic-backend.env`, not repo-root `.env`.

h4) [have] Verify backend and worker split flags:
- backend should serve HTTP
- worker should own ingestion worker loops

h5) [have] Avoid treating `/api/ops/queue/health` `worker_running:false` from the web runtime as a service-down signal when systemd and fresh worker logs prove the split worker is active.

## CI Gate

i1) [have] Update CI to run:
- `npm run typecheck`
- focused tests already expected by CI
- `npm run build:release`
- `npm run verify:release-artifact`

i2) [have] Ensure CI fails if `dist/server/index.mjs` is missing after build.

i3) [todo] Keep CI release checks deterministic and fast enough to avoid slowing normal iteration excessively.

## Docs And Governance

j1) [have] Update ops runbook deploy instructions so operators stop using ad-hoc `git pull && systemctl restart`.

j2) [have] Remove or correct stale single-service/deferred-worker language where it conflicts with live production.

j3) [have] Document the new release command, smoke checks, rollback behavior, and known failure signatures.

j4) [have] Add a short post-deploy checklist:
- health green
- queue health green
- recent logs clean
- current SHA equals expected SHA

j5) [todo] Keep this plan in the registry as the active implementation root until all proof gates pass.

## Proof Gates

k1) [have] Local proof:
- `npm run build:release`
- `npm run verify:release-artifact`
- `npm run typecheck`
- `npm run test`
- `npm run docs:link-check`
- `npm run docs:refresh-check -- --json`

k2) [have] CI proof:
- GitHub Actions passes with release artifact verification enabled

k3) [have] Oracle dry-run proof:
- deploy script can inspect topology and validate commands without restarting services

k4) [have] Oracle deploy proof:
- deploy to exact SHA
- artifact exists after build
- backend and worker restart cleanly
- `/api/health` returns ok
- queue health returns ok

k5) [have] Rollback proof:
- at minimum, validate rollback metadata is captured and commands are generated
- if safe to simulate, run a non-destructive rollback dry-run

k6) [todo] Docs proof:
- `npm run docs:refresh-check -- --json`
- `npm run docs:link-check`

## Round 2 Proof Notes

o1) [have] Commit `8d95e034` added the Oracle release deploy gate and passed CI Gate run `25043304160`.

o2) [have] Commit `16754322` added retrying post-restart health checks and passed CI Gate run `25043593626`.

o3) [have] `npm run deploy:oracle:dry-run -- --sha 8d95e0348f674cf4cb02bb9d33fca633a90fdf5a` validated Oracle topology, sudo restart access, Node `20.20.0`, clean tracked worktree, and target SHA availability without restart.

o4) [have] `npm run deploy:oracle -- --sha 167543226ab3a5f406eaa68cf581034694b1d938` deployed the exact SHA on Oracle, wrote `.deploy/last-deploy.json`, built and verified the release artifact, restarted `agentic-backend.service` then `agentic-worker.service`, and passed post-restart backend + queue health.

o5) [have] Oracle post-deploy smoke passed on `167543226ab3a5f406eaa68cf581034694b1d938`:
- `systemctl is-active agentic-backend.service agentic-worker.service => active / active`
- `npm run smoke:release -- --api-base-url http://127.0.0.1:8787 --service-token <redacted> => PASS`

## Closure Condition

l1) [todo] This chapter is complete only when:
- production release artifacts are built by a first-class command
- missing server artifacts fail before service restart
- Oracle deploys use one repeatable command
- post-deploy health and queue checks are built into the deploy flow
- CI catches artifact regressions
- docs match live service topology
- at least one successful deploy uses the new path

## Notes

m1) [have] This plan intentionally prioritizes safety and repeatability over minimal patch size.

m2) [have] The expected runtime performance impact is zero because the work changes build/deploy tooling, not request handling.

m3) [have] The expected developer-speed impact should be positive: fewer manual deployment steps and less chance of recovery work.
