# YT2BP v0 Contract

## Scope
- Endpoint: `POST /api/youtube-to-blueprint`
- Version: `v0`
- Stability rule: v0 changes must be additive or versioned.
- 2026-02-12 note: Project 2 Step 1 feed-summary hygiene changes are UI-only and do not alter this contract.
- 2026-02-12 note: Project 2 Step 2 feed-row shell changes are UI-only and do not alter this contract.
- 2026-02-12 note: Project 2 one-row full-tag rendering changes are UI-only and do not alter this contract.
- 2026-02-12 note: Project 2 one-row tag measurement hotfix is UI-only and does not alter this contract.
- 2026-02-13 note: Project 2 Step 3 wall-to-wall shell tightening and Wall/Explore comment counters are UI-only and do not alter this contract.
- 2026-02-13 note: Explore tag-click lookup hotfix (search-first behavior on feed cards) is UI-only and does not alter this contract.
- 2026-02-13 note: Project 3 Step 1 channel join-state UI wiring and filter-only chip behavior are frontend-only and do not alter this contract.
- 2026-02-13 note: Channels IA/routing phase (`/channels`, `/b/:channelSlug`, curated slug guards, `/tags` redirect) is UI-only and does not alter this contract.
- 2026-02-13 note: Channel-scoped `+ Create` flow routes to `/youtube?channel=<slug>&intent=post` and blocks public publish unless channel is valid and joined; this is UI/product behavior and does not alter this endpoint contract.

## Request
```json
{
  "video_url": "https://www.youtube.com/watch?v=...",
  "generate_review": false,
  "generate_banner": false,
  "source": "youtube_mvp"
}
```

### Request constraints
- Single YouTube clip only (`youtube.com/watch` or `youtu.be`).
- Playlist URLs are rejected.

## Success response
```json
{
  "ok": true,
  "run_id": "yt2bp-...",
  "draft": {
    "title": "string",
    "description": "string",
    "steps": [
      { "name": "string", "notes": "string", "timestamp": "string|null" }
    ],
    "notes": "string|null",
    "tags": ["string"]
  },
  "review": { "available": true, "summary": "string|null" },
  "banner": { "available": true, "url": "string|null" },
  "meta": {
    "transcript_source": "string",
    "confidence": "number|null",
    "duration_ms": "number"
  }
}
```

## Error response
```json
{
  "ok": false,
  "error_code": "STRING_BUCKET",
  "message": "User-safe message",
  "run_id": "string|null"
}
```

### Error buckets and status codes
- `SERVICE_DISABLED` -> `503`
- `INVALID_URL` -> `400`
- `NO_CAPTIONS` -> `422`
- `TRANSCRIPT_EMPTY` -> `422`
- `PROVIDER_FAIL` -> `502`
- `TIMEOUT` -> `504`
- `RATE_LIMITED` -> `429`
- `SAFETY_BLOCKED` -> `422`
- `PII_BLOCKED` -> `422`
- `GENERATION_FAIL` -> `500`

## Runtime controls
- `YT2BP_ENABLED`
- `YT2BP_QUALITY_ENABLED`
- `YT2BP_CONTENT_SAFETY_ENABLED`
- `YT2BP_ANON_LIMIT_PER_MIN`
- `YT2BP_AUTH_LIMIT_PER_MIN`
- `YT2BP_IP_LIMIT_PER_HOUR`

## Retry and timeout policy (v0)
- Endpoint timeout target: 120s.
- Quality retries: controlled by `YT2BP_QUALITY_MAX_RETRIES`.
- Content safety retries: controlled by `YT2BP_CONTENT_SAFETY_MAX_RETRIES`.
- Transcript fetch uses provider-level retry behavior.

## Current non-goals
- Playlist support.
- Multi-video merge.
- Instruction-security runtime checks (`llm_instruction_security_v0` is planned only).
- Contract-breaking schema changes.
