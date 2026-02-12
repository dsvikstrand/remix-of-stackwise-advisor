# YT2BP Runbook

## Purpose and ownership
- Service: YouTube to Blueprint (`/api/youtube-to-blueprint`)
- Runtime host: Oracle (`oracle-free`)
- Service unit: `agentic-backend.service`
- Primary owner: app backend maintainers

## Health checks
- Local service health:
```bash
ssh oracle-free 'curl -sS http://localhost:8787/api/health'
```
- Public health:
```bash
curl -sS https://bapi.vdsai.cloud/api/health
```
- Public YT2BP endpoint basic probe:
```bash
curl -sS -X POST https://bapi.vdsai.cloud/api/youtube-to-blueprint \
  -H 'Content-Type: application/json' \
  --data '{"video_url":"https://www.youtube.com/watch?v=16hFQZbxZpU","generate_review":false,"generate_banner":false,"source":"youtube_mvp"}'
```

## Service lifecycle
- Status:
```bash
ssh oracle-free 'sudo systemctl status --no-pager agentic-backend.service'
```
- Restart:
```bash
ssh oracle-free 'sudo systemctl restart agentic-backend.service'
```
- Tail logs:
```bash
ssh oracle-free 'sudo journalctl -u agentic-backend.service -n 200 --no-pager'
```
- Pull + restart:
```bash
ssh oracle-free 'cd /home/ubuntu/remix-of-stackwise-advisor && git pull --ff-only && sudo systemctl restart agentic-backend.service'
```

## Environment checklist
Required runtime variables:
- `OPENAI_API_KEY`
- `TRANSCRIPT_PROVIDER` (`yt_to_text` or `youtube_timedtext`)
- `YT2BP_ENABLED`
- `YT2BP_QUALITY_ENABLED`
- `YT2BP_CONTENT_SAFETY_ENABLED`
- `YT2BP_ANON_LIMIT_PER_MIN`
- `YT2BP_AUTH_LIMIT_PER_MIN`
- `YT2BP_IP_LIMIT_PER_HOUR`

Safe defaults:
- `YT2BP_ENABLED=true`
- `YT2BP_QUALITY_ENABLED=true`
- `YT2BP_CONTENT_SAFETY_ENABLED=true`
- `YT2BP_ANON_LIMIT_PER_MIN=6`
- `YT2BP_AUTH_LIMIT_PER_MIN=20`
- `YT2BP_IP_LIMIT_PER_HOUR=30`

## Failure playbooks

### `PROVIDER_FAIL`
- Meaning: transcript provider failed upstream.
- Action:
  1) Confirm provider setting (`TRANSCRIPT_PROVIDER`).
  2) Run toy transcript probe:
  ```bash
  TRANSCRIPT_PROVIDER=yt_to_text node --import tsx scripts/toy_fetch_transcript.ts --url 'https://www.youtube.com/watch?v=16hFQZbxZpU'
  ```
  3) Switch provider if needed.

### `RATE_LIMITED`
- Meaning: anon/auth/hourly limiter tripped.
- Action:
  1) Check request volume in logs.
  2) Temporarily raise limits if operationally justified.
  3) Keep hourly cap as abuse guard.

### `TIMEOUT`
- Meaning: pipeline exceeded max timeout.
- Action:
  1) Disable review/banner for smoke.
  2) Validate transcript provider latency.
  3) Check OpenAI latency and retries.

### `SAFETY_BLOCKED`
- Meaning: generated output violated content safety policy.
- Action:
  1) Confirm expected for source video category.
  2) Inspect `yt2bp-content-safety` log lines for flagged criteria.
  3) Do not bypass by default; only tune policy with explicit decision.

### `GENERATION_FAIL`
- Meaning: generation/quality stage failed after retries.
- Action:
  1) Inspect `yt2bp-quality` logs for failing criteria.
  2) Verify `OPENAI_API_KEY` and model availability.
  3) If incident pressure: use fallback profile below.

## Rollback / fallback controls
Incident profile (temporary):
- Keep endpoint up, reduce strictness first:
  - `YT2BP_QUALITY_ENABLED=false`
  - `YT2BP_CONTENT_SAFETY_ENABLED=true`
- If provider instability dominates:
  - keep endpoint enabled but switch transcript provider.
- Full stop (hard off):
  - `YT2BP_ENABLED=false`

After env change:
```bash
ssh oracle-free 'sudo systemctl restart agentic-backend.service'
```

## Post-deploy confidence checks
- Repro smoke:
```bash
npm run smoke:yt2bp -- --base-url https://bapi.vdsai.cloud
```
- Metrics summary (Oracle logs):
```bash
ssh oracle-free 'cd /home/ubuntu/remix-of-stackwise-advisor && npm run metrics:yt2bp -- --source journalctl --json'
```
