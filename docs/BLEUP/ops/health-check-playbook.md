# Health Check Playbook

Status: `current-session operational checklist`

## Scope

Use this for quick live health inspections after deploys, soaks, or suspected bugs. These commands are read-only unless explicitly noted.

## Frontend Release

a1) [have] Check live release metadata:

```bash
curl -fsS -H 'Cache-Control: no-cache' -H 'Pragma: no-cache' "https://bleup.app/release.json?bust=$(date +%s%N)"
```

a2) [todo] Confirm `release_sha` matches the expected Git SHA.

## API Health

b1) [have] Public backend health:

```bash
curl -fsS https://api.bleup.app/api/health
```

b2) [have] Expected output:

```json
{"ok":true}
```

## Oracle Services

c1) [have] Check backend/worker/GPU runner:

```bash
ssh oracle-free 'cd /home/ubuntu/remix-of-stackwise-advisor && printf "sha=" && git rev-parse HEAD && systemctl show agentic-backend.service -p ActiveState -p SubState -p NRestarts --no-pager && systemctl show agentic-worker.service -p ActiveState -p SubState -p NRestarts --no-pager && systemctl show gpu-runner.service -p ActiveState -p SubState -p NRestarts --no-pager'
```

c2) [have] Healthy state:
- services `active/running`
- restarts explainable
- Oracle SHA matches expected release

c3) [todo] If `NRestarts` changed, inspect `ExecMainStatus`, start timestamp, and recent logs before assuming a crash:

```bash
ssh oracle-free "systemctl show agentic-worker.service -p ActiveEnterTimestamp -p ExecMainStartTimestamp -p ExecMainStatus -p ExecMainCode -p NRestarts --no-pager"
```

## Queue And Provider Health

d1) [have] Queue/provider health:

```bash
ssh oracle-free 'set -a; . /etc/agentic-backend.env; set +a; curl -fsS -H "x-service-token: ${INGESTION_SERVICE_TOKEN}" http://127.0.0.1:8787/api/ops/queue/health'
```

d2) [have] Healthy signs:
- `ok=true`
- `queue_depth=0` or explainable
- `running_depth=0` or active known jobs
- `stale_leases=0`
- provider circuits closed or explainable

d3) [have] `worker_running=false` can be normal when no fresh running jobs exist; use the additive activity fields.

## Release Smoke

e1) [have] Run live smoke:

```bash
npm run smoke:release -- --api-base-url https://api.bleup.app --frontend-base-url https://bleup.app --release-sha "<expected-sha>"
```

e2) [have] Expected: release smoke `PASS`.

## Recent Logs

f1) [have] General risk scan:

```bash
ssh oracle-free "sudo -n journalctl -u agentic-backend.service -u agentic-worker.service --since '6 hours ago' --no-pager | grep -Ei 'error|failed|exception|fatal|oom|out of memory|heap out of memory|tag_family_supabase_break_glass|rate_limited|Provider operation timeout|Transcript queue is currently busy' | tail -n 160 || true"
```

f2) [have] Break-glass scan:

```bash
ssh oracle-free "sudo -n journalctl -u agentic-backend.service -u agentic-worker.service --since '24 hours ago' --no-pager | grep -F '[tag_family_supabase_break_glass]' || true"
```

f3) [have] Successful generation count:

```bash
ssh oracle-free "sudo -n journalctl -u agentic-backend.service -u agentic-worker.service --since '24 hours ago' --no-pager | grep -c '\\[yt2bp_stage_timing\\].*\\\"outcome\\\":\\\"succeeded\\\"' || true"
```

f4) [have] YouTube feed soft-failure count:

```bash
ssh oracle-free "sudo -n journalctl -u agentic-backend.service -u agentic-worker.service --since '24 hours ago' --no-pager | grep -c '\\[subscription_feed_fetch_soft_failed\\]' || true"
```

## GitHub CI

g1) [have] Check recent main runs:

```bash
GITHUB_TOKEN_VALUE=$(grep -m1 '^GITHUB_TOKEN=' .env | sed 's/^GITHUB_TOKEN=//' | sed 's/^"//' | sed 's/"$//')
GH_TOKEN="$GITHUB_TOKEN_VALUE" gh run list --branch main --limit 8
```

g2) [have] Never print the token.

## Worktree

h1) [have] Check local cleanliness:

```bash
git status -sb
```

## Supabase Attribution

i1) [have] Sample latest logs:

```bash
set -a; . ./.env; set +a; npm run ops:supabase-rest-attribution -- --json
```

i2) [have] Broader crawl:

```bash
set -a; . ./.env; set +a; npm run ops:supabase-rest-attribution -- --json --full-range
```

i3) [todo] Watch for:
- direct frontend product-table access in Oracle-owned domains
- unexpected migrated-family egress spikes
- break-glass-related traffic
- retained surfaces that need clear classification

## Interpretation Pattern

j1) [have] Runtime green means:
- release/API OK
- services running
- queue healthy
- provider circuits healthy
- smoke passes
- no crash/OOM/fatal logs

j2) [todo] Watch items are not always blockers:
- YouTube feed `404/500` soft failures can be source-health noise
- provider transient failures can happen globally
- empty queue with idle worker is normal
- `NRestarts=1` can be benign if status is `0` and current service is stable
