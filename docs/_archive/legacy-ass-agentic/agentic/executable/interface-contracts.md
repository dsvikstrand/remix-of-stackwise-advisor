# Interface Contracts (Spec-Only)

These are planned interfaces for implementation phase and not guaranteed as current runtime endpoints.

## Unified Response Envelope (Default)
All planned endpoints follow:
- `ok` (boolean)
- `error_code` (string or null)
- `message` (string)
- `data` (object or null)
- `meta` (object, optional)

Error envelope example
```json
{
  "ok": false,
  "error_code": "AUTH_REQUIRED",
  "message": "authentication required",
  "data": null,
  "meta": {
    "request_id": "req_123"
  }
}
```

## Auth Annotation Values
- `user_required`
- `service_required`
- `forbidden_for_anonymous`

## Idempotency Annotation Values
- `natural_key_upsert`
- `requires_idempotency_key`
- `read_only`

## Source Subscription Interfaces
### POST `/api/source-subscriptions`
Auth
- `user_required`
- `forbidden_for_anonymous`

Idempotency
- `natural_key_upsert`

Request
```json
{
  "source_type": "youtube",
  "source_channel_id": "UC_x5XG1OV2P6uZZ5FSM9Ttw",
  "mode": "selected"
}
```

Success response
```json
{
  "ok": true,
  "error_code": null,
  "message": "subscription upserted",
  "data": {
    "subscription_id": "sub_123",
    "mode": "selected"
  },
  "meta": {
    "idempotency_mode": "natural_key_upsert"
  }
}
```

### GET `/api/source-subscriptions`
Auth
- `user_required`
- `forbidden_for_anonymous`

Idempotency
- `read_only`

Success response
```json
{
  "ok": true,
  "error_code": null,
  "message": "subscriptions fetched",
  "data": {
    "items": [
      {
        "subscription_id": "sub_123",
        "source_type": "youtube",
        "source_channel_id": "UC_x5XG1OV2P6uZZ5FSM9Ttw",
        "mode": "selected",
        "is_active": true
      }
    ]
  }
}
```

### DELETE `/api/source-subscriptions/:id`
Auth
- `user_required`
- `forbidden_for_anonymous`

Idempotency
- `natural_key_upsert`

Success response
```json
{
  "ok": true,
  "error_code": null,
  "message": "subscription deleted",
  "data": {
    "deleted": true
  }
}
```

## Ingestion Job Interfaces
### POST `/api/ingestion/jobs/trigger`
Auth
- `service_required` (scheduler/automation path)

Idempotency
- `requires_idempotency_key`

Request
```json
{
  "subscription_id": "sub_123",
  "limit": 10
}
```

Success response
```json
{
  "ok": true,
  "error_code": null,
  "message": "ingestion job queued",
  "data": {
    "job_id": "job_456",
    "status": "queued"
  },
  "meta": {
    "idempotency_mode": "requires_idempotency_key"
  }
}
```

### GET `/api/ingestion/jobs/:jobId`
Auth
- `service_required`

Idempotency
- `read_only`

Success response
```json
{
  "ok": true,
  "error_code": null,
  "message": "ingestion job status",
  "data": {
    "job_id": "job_456",
    "status": "running",
    "processed": 3,
    "failed": 0
  }
}
```

## Channel Candidate Interfaces
### POST `/api/channel-candidates/:id/evaluate`
Auth
- `service_required`

Idempotency
- `requires_idempotency_key`

Success response
```json
{
  "ok": true,
  "error_code": null,
  "message": "candidate evaluated",
  "data": {
    "candidate_id": "cand_789",
    "decision": "failed",
    "reasons": ["FIT_LOW_CONFIDENCE"]
  }
}
```

### POST `/api/channel-candidates/:id/publish`
Auth
- `service_required`

Idempotency
- `requires_idempotency_key`

Success response
```json
{
  "ok": true,
  "error_code": null,
  "message": "candidate published",
  "data": {
    "candidate_id": "cand_789",
    "published": true,
    "channel_slug": "skincare"
  }
}
```

### POST `/api/channel-candidates/:id/reject`
Auth
- `service_required`

Idempotency
- `requires_idempotency_key`

Success response
```json
{
  "ok": true,
  "error_code": null,
  "message": "candidate rejected",
  "data": {
    "candidate_id": "cand_789",
    "rejected": true,
    "reason_code": "QUALITY_TOO_SHALLOW"
  }
}
```

## Interface Compatibility Rules
1. Additive evolution preferred for response payloads.
2. Error code enums require docs update in same change.
3. Breaking changes require versioning or explicit migration plan.
4. Auth and idempotency annotations are required for every mutable endpoint.
