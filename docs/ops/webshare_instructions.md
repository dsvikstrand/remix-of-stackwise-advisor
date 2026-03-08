# Webshare Explicit Proxy Instructions

## Purpose

This app can route only the `yt_to_text` transcript provider through one explicit Webshare proxy endpoint.

This is optional and is controlled entirely by env vars. If the proxy toggle is off, `yt_to_text` uses the normal direct request path.

## What Is Wired

- `YT_TO_TEXT_USE_WEBSHARE_PROXY=true` enables proxying only for the `yt_to_text` provider.
- The supported proxy modes are:
  - disabled
  - one explicit endpoint from `WEBSHARE_PROXY_URL`
  - one explicit endpoint from `WEBSHARE_PROXY_HOST` / `PORT` / `USERNAME` / `PASSWORD`
- `youtube_timedtext` and all other outbound app requests stay direct.
- When proxying is enabled, the app uses a lower-level `undici.request(...)` path with a cached `ProxyAgent`.
- When proxying is disabled, the app uses the normal `fetch(...)` path.
- Created blueprints persist transcript transport debug metadata under `selected_items.bp_transcript_transport`.

Relevant code:

- [server/services/webshareProxy.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/webshareProxy.ts)
- [server/transcript/providers/ytToTextProvider.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/transcript/providers/ytToTextProvider.ts)

## Required Env Vars

Recommended split fields:

```bash
YT_TO_TEXT_USE_WEBSHARE_PROXY=true
WEBSHARE_PROXY_HOST=p.webshare.io
WEBSHARE_PROXY_PORT=80
WEBSHARE_PROXY_USERNAME=<proxy_username>
WEBSHARE_PROXY_PASSWORD=<proxy_password>
```

Optional single-field alternative:

```bash
YT_TO_TEXT_USE_WEBSHARE_PROXY=true
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

## Oracle Smoke Test

Run a transcript smoke on Oracle:

```bash
ssh oracle-free '
  export NVM_DIR="$HOME/.nvm" &&
  . "$NVM_DIR/nvm.sh" &&
  nvm use 20.20.0 >/dev/null &&
  set -a &&
  . /etc/agentic-backend.env &&
  set +a &&
  cd /home/ubuntu/remix-of-stackwise-advisor &&
  TRANSCRIPT_PROVIDER=yt_to_text \
  node --import tsx scripts/toy_fetch_transcript.ts \
    --url "https://www.youtube.com/watch?v=tbzWpxKgFAM"
'
```

Expected result:

- JSON with `"ok": true`
- provider `yt_to_text`
- transcript text printed after the JSON block

Reset the cached proxy dispatcher without restarting Oracle:

```bash
curl -sS \
  -X POST \
  -H "x-service-token: $INGESTION_SERVICE_TOKEN" \
  https://api.bleup.app/api/debug/yt-to-text/reset-proxy
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
TRANSCRIPT_PROVIDER=yt_to_text \
node --import tsx scripts/toy_fetch_transcript.ts \
  --url "https://www.youtube.com/watch?v=tbzWpxKgFAM"
```

## Quick Verification Checklist

- `YT_TO_TEXT_USE_WEBSHARE_PROXY=true` is present in the runtime environment.
- Either `WEBSHARE_PROXY_URL` is set, or the split explicit proxy fields are complete.
- Oracle is using Node `20.20.0`.
- The server was restarted after changing `/etc/agentic-backend.env`.
- The transcript smoke test returns `"ok": true`.

## Troubleshooting

- `TRANSCRIPT_FETCH_FAIL` with a proxy-tunnel error:
  The proxy auth details are usually wrong, expired, or the proxy endpoint is invalid.
- Proxy toggle is on, but traffic still looks direct:
  The running process was likely not restarted after the env change, or the explicit proxy config is incomplete.
- Local proxy testing falls back to direct:
  Confirm you are using Node `20.20.0`; older Node versions can fail to load `undici` cleanly in this workspace.
- `yt_to_text` works direct but fails through proxy:
  Re-check the Webshare endpoint, protocol, username, and password against the residential dashboard values.

## For The Next Codex Session

- The Oracle repo path is `/home/ubuntu/remix-of-stackwise-advisor`.
- The SSH alias is `oracle-free`.
- This app currently uses one explicit Webshare proxy only for `yt_to_text`, not for all network traffic.
- The most common gotchas are forgetting to restart after env changes or testing locally with Node below `20`.
