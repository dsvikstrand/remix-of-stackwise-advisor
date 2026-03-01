# bleuV1 Glossary

## Purpose
Lock terminology to prevent product and implementation drift.

## Core Terms

### Source Item
Canonical media object from an adapter input, identified by a stable native source key (for MVP: YouTube video id).

### Imported Blueprint
Primary content unit generated from a Source Item. It is step-based and retains source provenance.

### Insight
User-authored contextual addition attached to an Imported Blueprint. It is commentary/value-add, not standalone primary content.

### Remix
User-authored modification or derivative of an Imported Blueprint that preserves linkage to the original source-derived blueprint.

### My Feed
Personal/private user lane containing pulled/imported items and channel-rejected items. It can contain broader/noisier content than channels.

### Channel Candidate
A My Feed item submitted for potential publication to a shared channel lane.

### Channel Publish
A successful shared distribution result after channel-fit, quality, safety, and PII gate decisions allow publication.

### Channel Reject
A terminal decision where a candidate is not shared in channel. The item remains in My Feed by default.

### Gate Outcome
Per gate result status: `pass`, `warn`, or `block`, with associated reason code and evidence fields.

### Selected Mode
Default source pull mode where user explicitly approves or submits items for channel promotion path.

### Auto Mode
Optional future mode where eligible items may enter promotion flow automatically under configured rules.

### Canonical Key
Stable identity string for dedupe/idempotency. Example for MVP: `youtube:<youtube_video_id>`.

### Artifact Cache Key
Stable key for generated blueprint reuse across users and pulls. Example shape: `yt2bp:<youtube_video_id>:pipeline:<pipeline_version>`.

## Explicit Non-Equivalences
- Channel != Tag
- Insight != Standalone Post
- My Feed publish != Channel publish
- Imported Blueprint != Generic user post

## Naming Rules
1. Use `Imported Blueprint` for source-derived content in docs and PRs.
2. Use `Insight` or `Remix` for user-authored add-ons.
3. Do not describe MVP core as library-first or standalone-post-first.
