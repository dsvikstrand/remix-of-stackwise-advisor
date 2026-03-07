# Webshare + Oracle Server Instructions

## Purpose

This app can route only the `yt_to_text` transcript provider through a single fixed Webshare proxy.

This is optional and is controlled entirely by env vars. If the proxy toggle is off, `yt_to_text` uses the normal direct request path.

## What Is Wired

- `YT_TO_TEXT_USE_WEBSHARE_PROXY=true` enables proxying only for the `yt_to_text` provider.
- `YT_TO_TEXT_PROXY_SELECT_BY_INDEX=true` can choose one fixed Webshare `direct` proxy by zero-based index.
- `youtube_timedtext` and all other outbound app requests stay direct.
- When proxying is enabled, the app uses a lower-level `undici.request(...)` path with a cached `ProxyAgent`.
- When proxying is disabled, the app uses the normal `fetch(...)` path.
- Created blueprints now persist transcript transport debug metadata under `selected_items.bp_transcript_transport`.

Relevant code:

- [server/services/webshareProxy.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/webshareProxy.ts)
- [server/transcript/providers/ytToTextProvider.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/transcript/providers/ytToTextProvider.ts)

## Required Env Vars

Use either the split proxy fields / URL, or the fixed selector-by-index mode.

Explicit fixed proxy mode:

Recommended split fields:

```bash
YT_TO_TEXT_USE_WEBSHARE_PROXY=true
WEBSHARE_PROXY_HOST=<proxy_host>
WEBSHARE_PROXY_PORT=<proxy_port>
WEBSHARE_PROXY_USERNAME=<proxy_username>
WEBSHARE_PROXY_PASSWORD=<proxy_password>
```

Optional single-field alternative:

```bash
YT_TO_TEXT_USE_WEBSHARE_PROXY=true
WEBSHARE_PROXY_URL=http://<username>:<password>@<host>:<port>
```

Developer fixed selector-by-index mode:

```bash
YT_TO_TEXT_USE_WEBSHARE_PROXY=true
YT_TO_TEXT_PROXY_SELECT_BY_INDEX=true
YT_TO_TEXT_PROXY_INDEX=rand
WEBSHARE_API_KEY=<webshare_api_key>
WEBSHARE_PLAN_ID=<webshare_plan_id>
WEBSHARE_BASE_URL=https://proxy.webshare.io/api
```

Notes:

- If `WEBSHARE_PROXY_URL` is set, it takes precedence.
- If `YT_TO_TEXT_PROXY_SELECT_BY_INDEX=true`, the app tries to fetch the Webshare `direct` proxy list and select one fixed proxy by zero-based index, or by a one-time random choice when `YT_TO_TEXT_PROXY_INDEX=rand`.
- If the selected index is invalid or the Webshare API lookup fails, the app falls back to the explicit fixed proxy config.
- If the proxy toggle is on but the proxy config is incomplete, the app logs one warning and falls back to direct requests.
- Keep using one fixed `direct` proxy entry if you want a stable exit IP.

## Oracle Server Gotchas

The production backend should not boot from repo-root `.env` files on Oracle.

Use `/etc/agentic-backend.env` as the canonical runtime config source for the live service, then restart `agentic-backend.service`.

If you want to use the proxy pseudo-restart endpoint below, also set:

```bash
ENABLE_DEBUG_ENDPOINTS=true
```

The proxy implementation also depends on the `undici` package from `package.json`, so after pulling a new commit that changes proxy code, run `npm install` on Oracle before restarting.

Safe pattern on Oracle:

```bash
ssh oracle-free '
  cd /home/ubuntu/remix-of-stackwise-advisor &&
  export NVM_DIR="$HOME/.nvm" &&
  . "$NVM_DIR/nvm.sh" &&
  nvm use 20.20.0 >/dev/null &&
  nohup tsx server/index.ts >/tmp/bleu-server.log 2>&1 < /dev/null &
'
```

If the app is already running, stop the old process first:

```bash
ssh oracle-free "pkill -f 'tsx server/index.ts'"
```

Then start it again using the export pattern above.

## How To Get One Fixed Webshare Proxy

From this Codex environment, with `WEBSHARE_API_KEY` and `WEBSHARE_PLAN_ID` set locally:

```bash
curl -sS \
  -H "Authorization: Token $WEBSHARE_API_KEY" \
  "${WEBSHARE_BASE_URL:-https://proxy.webshare.io/api}/v2/proxy/list/?mode=direct&plan_id=$WEBSHARE_PLAN_ID"
```

Pick one entry and copy:

- `proxy_address`
- `port`
- `username`
- `password`

Those values map directly to the split env vars above.

If you want the app to choose by index instead, keep the same `WEBSHARE_API_KEY` and `WEBSHARE_PLAN_ID`, then set:

```bash
YT_TO_TEXT_PROXY_SELECT_BY_INDEX=true
YT_TO_TEXT_PROXY_INDEX=rand
```

That means:

- `0` selects the first proxy in the returned direct list
- `1` selects the second
- `2` selects the third
- `rand` chooses one random usable proxy once when the process first resolves the selector

The chosen proxy stays fixed until the process restarts or the proxy helper cache is reset.

## Oracle Smoke Test

Run a direct transcript smoke on Oracle with the current `.env`:

```bash
ssh oracle-free '
  cd /home/ubuntu/remix-of-stackwise-advisor &&
  export NVM_DIR="$HOME/.nvm" &&
  . "$NVM_DIR/nvm.sh" &&
  nvm use 20.20.0 >/dev/null &&
  TRANSCRIPT_PROVIDER=yt_to_text \
  node --import tsx scripts/toy_fetch_transcript.ts \
    --url "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
'
```

Expected result:

- JSON with `"ok": true`
- provider `yt_to_text`
- transcript text printed after the JSON block

Reset the cached `rand` proxy choice without restarting Oracle:

```bash
curl -sS \
  -X POST \
  -H "x-service-token: $INGESTION_SERVICE_TOKEN" \
  https://bapi.vdsai.cloud/api/debug/yt-to-text/reset-proxy
```

Expected result:

- JSON with `"ok": true`
- `data.reset: true`
- `data.proxy_selector_mode: "rand"` (or `index` / `explicit` / `sample` depending on env)

Run the round-robin proxy smoke on Oracle:

```bash
scp scripts/round_robin_webshare_smoke.ts oracle-free:/tmp/round_robin_webshare_smoke.ts
ssh oracle-free '
  export NVM_DIR="$HOME/.nvm" &&
  . "$NVM_DIR/nvm.sh" &&
  nvm use 20.20.0 >/dev/null &&
  cd /home/ubuntu/remix-of-stackwise-advisor &&
  WEBSHARE_API_KEY=... \
  WEBSHARE_PLAN_ID=... \
  tsx /tmp/round_robin_webshare_smoke.ts --count 10
'
```

Expected result:

- JSON summary with `rows`
- one row per proxy in strict order
- each row shows the observed `exit_ip`

## Local Smoke Test

From this repo:

```bash
set -a
source .env
set +a
TRANSCRIPT_PROVIDER=yt_to_text \
node --import tsx scripts/toy_fetch_transcript.ts \
  --url "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

## Quick Verification Checklist

- `YT_TO_TEXT_USE_WEBSHARE_PROXY=true` is present in the runtime environment.
- Either the proxy fields point to one valid `direct` Webshare proxy, or the selector-by-index settings are valid.
- Oracle is using Node `20.20.0`.
- The server was restarted after changing `.env`.
- The smoke test returns `"ok": true`.

## Troubleshooting

- `TRANSCRIPT_FETCH_FAIL` with a proxy-tunnel error:
  The proxy auth details are usually wrong, expired, or the proxy endpoint is invalid.
- Selector-by-index is enabled, but the app still uses the explicit proxy:
  The selected index may be out of range, or the Webshare API lookup failed, so the helper fell back to the explicit fixed proxy settings.
- Proxy toggle is on, but traffic still looks direct:
  The running process was likely not restarted after `.env` changed, or the wrong `.env` file was edited.
- `yt_to_text` works direct but fails through proxy:
  Re-check the selected Webshare proxy by testing it with `curl --proxy ... https://ipv4.webshare.io/`.
- Oracle restart worked, but the old behavior remains:
  Confirm the old `tsx server/index.ts` process was actually stopped before the restart.

## For The Next Codex Session

- The Oracle repo path is `/home/ubuntu/remix-of-stackwise-advisor`.
- The SSH alias is `oracle-free`.
- This app currently uses a fixed Webshare proxy only for `yt_to_text`, not for all network traffic.
- The most common gotchas are forgetting to restart after `.env` changes, or forgetting to run `npm install` on Oracle after pulling proxy-related dependency updates.
