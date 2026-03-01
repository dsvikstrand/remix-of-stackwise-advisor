# Schema Contracts (Spec-Only)

Purpose: strict invariants for planned `bleuV1` data model.

## Entity Invariants

### SourceItem
- unique(`canonical_key`)
- `source_type` must be `youtube` in MVP.
- `source_native_id` must be non-empty and normalized.

### UserSourceSubscription
- unique(`user_id`, `source_type`, `source_channel_id`)
- `mode` in MVP: `selected` or `auto`.
- default mode: `selected`.

### UserFeedItem
- unique(`user_id`, `source_item_id`)
- state must follow lifecycle contract.
- on channel reject, item remains in My Feed by default.

### ChannelCandidate
- unique(`user_feed_item_id`, `channel_slug`) unless explicit versioning mode introduced.
- status transitions must be auditable.

### ChannelGateDecision
- requires `candidate_id`, `gate_id`, `outcome`, `reason_code`, timestamp.
- `outcome=block` must include non-empty reason code.

### InsightRemix
- must reference existing blueprint id.
- `kind` must be `insight` or `remix`.

## Idempotency Contracts
1. Same YouTube video id resolves to same canonical SourceItem.
2. Same artifact key reuses generated artifact.
3. Repeated user pull should upsert existing UserFeedItem, not duplicate.

## Cache Contracts
- key format: `yt2bp:<youtube_video_id>:pipeline:<pipeline_version>`
- cache invalidation requires explicit policy/version reason.
- pipeline version change invalidates cache eligibility.

## Migration Compatibility Rules
1. Schema changes must keep existing read paths safe until rollout complete.
2. New nullable fields are preferred over mandatory field introduction in one step.
3. Removing fields requires deprecation period and docs update.

## Rollback Constraints
1. Every schema-affecting task must include backward-compatible rollback path.
2. If rollback cannot preserve compatibility, task requires stop-checkpoint before merge.
