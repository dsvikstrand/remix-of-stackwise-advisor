# bleuV1 Data Contract (Spec-Only)

This document defines planned interfaces for implementation phase. These entities are not fully implemented yet.

## Canonical Key Strategy
Source identity
- `source_type`: `youtube`
- `source_native_id`: `youtube_video_id`
- canonical key: `youtube:<youtube_video_id>`

Blueprint artifact identity
- `artifact_key`: `youtube:<youtube_video_id>:pipeline:<pipeline_version>`

## Planned Entities

### 1) SourceItem
Purpose
- Canonical media object that can be shared across users.

Required fields
- `id` (internal UUID)
- `source_type` (`youtube`)
- `source_native_id` (youtube video id)
- `canonical_key` (`youtube:<id>`)
- `source_url`
- `title`
- `published_at`
- `ingest_status`
- `created_at`, `updated_at`

Optional fields
- `transcript_hash`
- `duration_sec`
- `channel_native_id`

Constraints
- unique(`canonical_key`)

### 2) UserSourceSubscription
Purpose
- User follows a source channel/feed for ingestion.

Required fields
- `id`
- `user_id`
- `source_type` (`youtube`)
- `source_channel_id`
- `mode` (`selected` or `auto`)
- `is_active`
- `created_at`, `updated_at`

Constraints
- unique(`user_id`, `source_type`, `source_channel_id`)

### 3) UserFeedItem
Purpose
- Per-user personal feed representation of imported blueprint content.

Required fields
- `id`
- `user_id`
- `source_item_id`
- `blueprint_id`
- `state` (`my_feed_published`, `candidate_submitted`, `candidate_pending_manual_review`, `channel_published`, `channel_rejected`)
- `created_at`, `updated_at`

Optional fields
- `remix_version_id`
- `last_decision_code`

Constraints
- unique(`user_id`, `source_item_id`)

### 4) ChannelCandidate
Purpose
- Promotion request from My Feed to a channel lane.

Required fields
- `id`
- `user_feed_item_id`
- `channel_slug`
- `status` (`pending`, `pending_manual_review`, `passed`, `failed`, `published`, `rejected`)
- `submitted_by_user_id`
- `created_at`, `updated_at`

Constraints
- unique(`user_feed_item_id`, `channel_slug`)

### 5) ChannelGateDecision
Purpose
- Decision log per gate class for candidate evaluation.

Required fields
- `id`
- `candidate_id`
- `gate_id` (`channel_fit`, `quality`, `safety`, `pii`)
- `outcome` (`pass`, `warn`, `block`)
- `reason_code`
- `score` (nullable numeric)
- `model_or_method`
- `created_at`

Constraints
- unique(`candidate_id`, `gate_id`, `created_at`) by logging event semantics

### 6) InsightRemix
Purpose
- User value-add attached to an imported blueprint.

Required fields
- `id`
- `blueprint_id`
- `author_user_id`
- `kind` (`insight`, `remix`)
- `content`
- `created_at`, `updated_at`

Optional fields
- `parent_remix_id`
- `moderation_state`

## Cache Contract
Artifact cache key
- `yt2bp:<youtube_video_id>:pipeline:<pipeline_version>`

Cache payload
- generated blueprint
- transcript source metadata
- gate-ready metadata (hashes, counts)

Cache rule
- reuse cached artifact for same key; do not regenerate unless pipeline version changes or explicit invalidation is requested.

## Idempotency Contract
Ingestion
- multiple pulls of same `youtube_video_id` must resolve to the same `SourceItem`.

Generation
- same `artifact_key` should produce reused artifact reference, not duplicate generation.

Feed publish
- inserting `UserFeedItem` for same (`user_id`, `source_item_id`) should upsert/no-op, not duplicate.

Candidate submission
- re-submit for same (`user_feed_item_id`, `channel_slug`) should update existing pending/pending_manual_review/failed candidate unless policy requires new version.

Endpoint idempotency modes
- `POST /api/source-subscriptions`: `natural_key_upsert`
- `POST /api/ingestion/jobs/trigger`: `requires_idempotency_key`
- `POST /api/channel-candidates/:id/evaluate`: `requires_idempotency_key`
- `POST /api/channel-candidates/:id/publish`: `requires_idempotency_key`
- `POST /api/channel-candidates/:id/reject`: `requires_idempotency_key`

## Duplicate Merge Rules
1. Cross-user duplicates
- Shared canonical `SourceItem` and shared artifact cache.
- Per-user feed rows remain distinct.

2. Same-user duplicates
- Additional pulls map to existing `UserFeedItem` and refresh metadata timestamps.

3. Channel duplicate candidates
- One active candidate per (`user_feed_item_id`, `channel_slug`) unless policy versioning requires fork.

## Ownership Of State Transitions
System-owned
- source normalization, generation, gate evaluation, publication writes

User-owned
- candidate submission, manual review decisions, optional remix/insight creation, personal hide/remove actions

Moderator-owned
- policy override decisions and enforced channel removals

## Planned Telemetry Interface (Spec-Only)
Event names
- `source_pull_requested`
- `source_pull_succeeded`
- `source_pull_failed`
- `my_feed_publish_succeeded`
- `candidate_submitted`
- `candidate_manual_review_pending`
- `candidate_gate_result`
- `channel_publish_succeeded`
- `channel_publish_rejected`
- `insight_created`
- `remix_created`

Required metadata fields
- `event_version`
- `session_id`
- `source_type`
- `source_native_id` (where applicable)
- `candidate_id` (where applicable)
- `reason_code` (for failures/rejections)

This telemetry contract is spec-only in this phase and must not be interpreted as runtime-complete.
