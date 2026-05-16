# Oracle Backend Operations

Status: `current-session summary`

## What Oracle Is In This App

a1) [have] Oracle is the production server host for the backend API and ingestion/background worker.

a2) [have] Oracle also holds local SQLite/control-plane state used by the Oracle ownership migration.

a3) [have] Oracle is not just a deployment target; it is increasingly the normal runtime owner for product ledgers that used to be Supabase-backed.

## Access

b1) [have] Use SSH alias:

```bash
ssh oracle-free
```

b2) [have] Sanity check:

```bash
ssh -o BatchMode=yes -o ConnectTimeout=10 oracle-free "echo ok"
```

b3) [have] Repo path on Oracle:

```bash
/home/ubuntu/remix-of-stackwise-advisor
```

b4) [have] Check deployed repo state:

```bash
ssh oracle-free "cd /home/ubuntu/remix-of-stackwise-advisor && git status -sb && git rev-parse HEAD"
```

## Node Runtime

c1) [have] Production expects Node `20.20.0`.

c2) [have] One-shot SSH may show older system Node unless nvm is sourced.

c3) [have] Use:

```bash
ssh oracle-free 'export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 20.20.0 >/dev/null; node -v'
```

## Services

d1) [have] Backend API:

```bash
agentic-backend.service
```

d2) [have] Background worker:

```bash
agentic-worker.service
```

d3) [have] GPU runner may exist separately:

```bash
gpu-runner.service
```

d4) [have] Inspect services:

```bash
ssh oracle-free 'systemctl show agentic-backend.service -p ActiveState -p SubState -p NRestarts --no-pager && systemctl show agentic-worker.service -p ActiveState -p SubState -p NRestarts --no-pager'
```

d5) [have] Start/stop GPU runner only when intentionally operating that service:

```bash
ssh oracle-free "sudo systemctl stop gpu-runner.service"
ssh oracle-free "sudo systemctl start gpu-runner.service"
```

## Production Env

e1) [have] Canonical production env:

```bash
/etc/agentic-backend.env
```

e2) [have] Backend startup must not rely on repo-root `.env` on Oracle.

e3) [have] Inspect non-secret config shape carefully:

```bash
ssh oracle-free 'set -a; . /etc/agentic-backend.env; set +a; env | grep -E "^(ORACLE_.*MODE|WORKER_CONCURRENCY|TRANSCRIPT_THROTTLE_MAX_CONCURRENCY)=" | sort'
```

## Deploy

f1) [have] Backend deploy command from local repo:

```bash
npm run deploy:oracle -- --sha "$(git rev-parse HEAD)"
```

f2) [have] Dry run:

```bash
npm run deploy:oracle:dry-run -- --sha "$(git rev-parse HEAD)"
```

f3) [have] Expected deploy proof:
- artifact verification passes
- backend health passes after restart
- queue health passes after restart
- deployed Oracle SHA matches intended SHA

## Health Checks

g1) [have] Public API:

```bash
curl -fsS https://api.bleup.app/api/health
```

g2) [have] Queue/provider health:

```bash
ssh oracle-free 'set -a; . /etc/agentic-backend.env; set +a; curl -fsS -H "x-service-token: ${INGESTION_SERVICE_TOKEN}" http://127.0.0.1:8787/api/ops/queue/health'
```

g3) [have] Release smoke:

```bash
npm run smoke:release -- --api-base-url https://api.bleup.app --frontend-base-url https://bleup.app --release-sha "$(git rev-parse HEAD)"
```

g4) [have] Recent error logs:

```bash
ssh oracle-free "sudo -n journalctl -u agentic-backend.service -u agentic-worker.service --since '6 hours ago' --no-pager | grep -Ei 'error|failed|exception|fatal|oom|out of memory|heap out of memory|tag_family_supabase_break_glass|rate_limited|Provider operation timeout|Transcript queue is currently busy' | tail -n 160 || true"
```

## Responsibilities

h1) [have] Serve backend HTTP API.

h2) [have] Run ingestion/background queue worker.

h3) [have] Own Oracle-local runtime ledgers/control-plane state for migrated domains.

h4) [have] Host release artifact and Node runtime.

h5) [have] Provide operational health signals for queue, providers, logs, and services.

## Watch Items

i1) [todo] Worker restarts: check `NRestarts`, `ExecMainStatus`, and logs before assuming a crash.

i2) [todo] YouTube feed soft failures: `FEED_FETCH_FAILED:404/500` can be noisy and usually should not poison scheduler status.

i3) [todo] Provider errors: distinguish global provider load/timeout from local queue-slot and app bugs.

i4) [todo] Break-glass usage: `[tag_family_supabase_break_glass]` should be absent in normal runtime.
