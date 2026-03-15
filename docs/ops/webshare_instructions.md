# Webshare Explicit Proxy Instructions

## Purpose

This app can route opted-in transcript providers through one explicit Webshare proxy endpoint.

This is optional and controlled entirely by env vars. If the proxy toggle is off, providers use the normal direct request path.

## What Is Wired

- `TRANSCRIPT_USE_WEBSHARE_PROXY=true` enables shared proxy transport for providers that opt into the Webshare helper.
- Supported proxy modes:
  - disabled
  - one explicit endpoint from `WEBSHARE_PROXY_URL`
  - one explicit endpoint from `WEBSHARE_PROXY_HOST` / `WEBSHARE_PROXY_PORT` / `WEBSHARE_PROXY_USERNAME` / `WEBSHARE_PROXY_PASSWORD`
- Current opted-in provider:
  - local/dev `videotranscriber_temp`
- `youtube_timedtext` and all non-transcript outbound app requests stay direct.
- When proxying is enabled, the app uses a lower-level `undici.request(...)` path with a cached `ProxyAgent`.
- When proxying is disabled, the app uses the normal `fetch(...)` path.

Relevant code:

- [server/services/webshareProxy.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/webshareProxy.ts)
- [server/transcript/providers/videoTranscriberTempProvider.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/transcript/providers/videoTranscriberTempProvider.ts)

## Required Env Vars

Recommended split fields:

```bash
TRANSCRIPT_USE_WEBSHARE_PROXY=true
WEBSHARE_PROXY_HOST=p.webshare.io
WEBSHARE_PROXY_PORT=80
WEBSHARE_PROXY_USERNAME=<proxy_username>
WEBSHARE_PROXY_PASSWORD=<proxy_password>
```

Optional single-field alternative:

```bash
TRANSCRIPT_USE_WEBSHARE_PROXY=true
WEBSHARE_PROXY_URL=http://<username>:<password>@<host>:<port>
```

Notes:

- If `WEBSHARE_PROXY_URL` is set, it takes precedence over the split fields.
- Webshare should be configured with `HTTP` protocol for this app.
- If the proxy toggle is on but the explicit config is incomplete, the app logs one warning and falls back to direct requests.

## Oracle Runtime

The production backend should not boot from repo-root `.env` files on Oracle.

Use `/etc/agentic-backend.env` as the canonical runtime config source for the live service, then restart `agentic-backend.service`.

If you want to use the proxy cache reset endpoint below, also set:

```bash
ENABLE_DEBUG_ENDPOINTS=true
```

Oracle runtime note:

- `videotranscriber_temp` is a local/dev-only path and should not be treated as Oracle production/runtime truth.
- `youtube_timedtext` remains direct and does not use the Webshare helper.

Reset the cached proxy dispatcher without restarting Oracle:

```bash
curl -sS \
  -X POST \
  -H "x-service-token: $INGESTION_SERVICE_TOKEN" \
  https://api.bleup.app/api/debug/transcript/reset-proxy
```

Expected result:

- JSON with `"ok": true`
- `data.reset: true`
- `data.proxy_mode: "explicit"` or `data.proxy_mode: "disabled"`

## Local Smoke Test

From this repo, using Node `20.20.0`:

```bash
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 20.20.0 >/dev/null
set -a
source .env
set +a
TRANSCRIPT_PROVIDER=videotranscriber_temp \
node --import tsx scripts/toy_fetch_transcript.ts \
  --url "https://www.youtube.com/watch?v=tbzWpxKgFAM"
```

Direct fallback check:

```bash
TRANSCRIPT_PROVIDER=youtube_timedtext \
node --import tsx scripts/toy_fetch_transcript.ts \
  --url "https://www.youtube.com/watch?v=tbzWpxKgFAM"
```

## Quick Verification Checklist

- `TRANSCRIPT_USE_WEBSHARE_PROXY=true` is present in the runtime environment.
- Either `WEBSHARE_PROXY_URL` is set, or the split explicit proxy fields are complete.
- Oracle is using Node `20.20.0`.
- The server was restarted after changing `/etc/agentic-backend.env`.
- The transcript smoke test returns `"ok": true`.
- Local `videotranscriber_temp` runs should report transcript transport with `provider: "videotranscriber_temp"` and `proxy_enabled: true` when the proxy toggle is on.

## Troubleshooting

- `TRANSCRIPT_FETCH_FAIL` with a proxy-tunnel error:
  The proxy auth details are usually wrong, expired, or the proxy endpoint is invalid.
- Proxy toggle is on, but traffic still looks direct:
  The running process was likely not restarted after the env change, the explicit proxy config is incomplete, or the provider in use does not opt into the shared Webshare helper.
- Local proxy testing falls back to direct:
  Confirm you are using Node `20.20.0`; older Node versions can fail to load `undici` cleanly in this workspace.
- `videotranscriber_temp` works direct but fails through proxy:
  Re-check the Webshare endpoint, protocol, username, and password against the residential dashboard values.

## For The Next Codex Session

- The Oracle repo path is `/home/ubuntu/remix-of-stackwise-advisor`.
- The SSH alias is `oracle-free`.
- This app uses one explicit Webshare proxy only for opted-in transcript providers, not for all network traffic.
- The most common gotchas are forgetting to restart after env changes or testing locally with Node below `20`.
