# Webshare + Oracle Server Instructions

## Purpose

This app can route only the `yt_to_text` transcript provider through a single fixed Webshare proxy.

This is optional and is controlled entirely by env vars. If the proxy toggle is off, `yt_to_text` uses the normal direct request path.

## What Is Wired

- `YT_TO_TEXT_USE_WEBSHARE_PROXY=true` enables proxying only for the `yt_to_text` provider.
- `youtube_timedtext` and all other outbound app requests stay direct.
- When proxying is enabled, the app uses a lower-level `undici.request(...)` path with a cached `ProxyAgent`.
- When proxying is disabled, the app uses the normal `fetch(...)` path.

Relevant code:

- [server/services/webshareProxy.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/services/webshareProxy.ts)
- [server/transcript/providers/ytToTextProvider.ts](/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu/server/transcript/providers/ytToTextProvider.ts)

## Required Env Vars

Use either the split proxy fields or a full proxy URL.

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

Notes:

- If `WEBSHARE_PROXY_URL` is set, it takes precedence.
- If the proxy toggle is on but the proxy config is incomplete, the app logs one warning and falls back to direct requests.
- Keep using one fixed `direct` proxy entry if you want a stable exit IP.

## Oracle Server Gotcha

The server code does not load `.env` automatically.

That means updating `/home/ubuntu/remix-of-stackwise-advisor/.env` is not enough by itself. The shell that starts the server must export that file before launching `tsx server/index.ts`.

Safe pattern on Oracle:

```bash
ssh oracle-free '
  cd /home/ubuntu/remix-of-stackwise-advisor &&
  export NVM_DIR="$HOME/.nvm" &&
  . "$NVM_DIR/nvm.sh" &&
  nvm use 20.20.0 >/dev/null &&
  set -a &&
  . ./.env &&
  set +a &&
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

## Oracle Smoke Test

Run a direct transcript smoke on Oracle with the current `.env`:

```bash
ssh oracle-free '
  cd /home/ubuntu/remix-of-stackwise-advisor &&
  export NVM_DIR="$HOME/.nvm" &&
  . "$NVM_DIR/nvm.sh" &&
  nvm use 20.20.0 >/dev/null &&
  set -a &&
  . ./.env &&
  set +a &&
  TRANSCRIPT_PROVIDER=yt_to_text \
  node --import tsx scripts/toy_fetch_transcript.ts \
    --url "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
'
```

Expected result:

- JSON with `"ok": true`
- provider `yt_to_text`
- transcript text printed after the JSON block

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
- The proxy fields point to one valid `direct` Webshare proxy.
- Oracle is using Node `20.20.0`.
- The server was restarted after changing `.env`.
- The smoke test returns `"ok": true`.

## Troubleshooting

- `TRANSCRIPT_FETCH_FAIL` with a proxy-tunnel error:
  The proxy auth details are usually wrong, expired, or the proxy endpoint is invalid.
- Proxy toggle is on, but traffic still looks direct:
  The running process was likely started without exporting `.env`.
- `yt_to_text` works direct but fails through proxy:
  Re-check the selected Webshare proxy by testing it with `curl --proxy ... https://ipv4.webshare.io/`.
- Oracle restart worked, but the old behavior remains:
  Confirm the old `tsx server/index.ts` process was actually stopped before the restart.

## For The Next Codex Session

- The Oracle repo path is `/home/ubuntu/remix-of-stackwise-advisor`.
- The SSH alias is `oracle-free`.
- This app currently uses a fixed Webshare proxy only for `yt_to_text`, not for all network traffic.
- The most common gotcha is forgetting that `.env` must be exported into the shell before starting the server.
