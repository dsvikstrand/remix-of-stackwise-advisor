# BLEUP Glossary

Status: `current-session summary`

a1) [have] `Blueprint`
- A structured, compact output generated from a source video/media item.

a2) [have] `Source item`
- A single source media object, currently usually a YouTube video.

a3) [have] `Source page`
- Public source/creator page such as a YouTube channel represented at `/s/:platform/:externalId`.

a4) [have] `Locked card`
- A `For You` feed card for a source item that is available to generate/unlock but does not yet have a ready blueprint for that user.

a5) [have] `Generated card`
- A feed card attached to a ready/generated blueprint.

a6) [have] `For You`
- Personal Home lane. Contains subscribed-source locked cards and personally relevant generated cards.

a7) [have] `Joined`
- Auth-only Home lane showing published blueprints filtered by joined BLEUP channels.

a8) [have] `All`
- Public/global Home lane showing published blueprints across channels.

a9) [have] `BLEUP channel`
- App topic/channel grouping for published blueprints, separate from YouTube source subscriptions.

a10) [have] `Source subscription`
- User follows a source creator/channel so future uploads can enter `For You`.

a11) [have] `Auto-channel`
- Backend pipeline that evaluates and publishes eligible blueprints into BLEUP channels.

a12) [have] `YT2BP`
- YouTube-to-blueprint generation pipeline.

a13) [have] `Transcript provider`
- Runtime provider used to fetch/transcribe source video text. Current flow opportunistically tries YouTube timed text, then fallback providers.

a14) [have] `Queue`
- Durable ingestion/generation job system. In production, Oracle queue-ledger primary is the normal runtime owner.

a15) [have] `Worker`
- Background process that claims and executes queued work.

a16) [have] `Oracle`
- Production server and Oracle-local control-plane/SQLite runtime state layer.

a17) [have] `Supabase`
- Auth/session provider and retained managed-service/historical compatibility platform.

a18) [have] `Oracle ledger`
- Local Oracle state table/store that owns a migrated runtime domain such as queue, feed, source items, subscriptions, unlocks, or generation state.

a19) [have] `Compatibility shadow`
- Supabase row/state retained for rollback, FK compatibility, historical access, or migration overlap while Oracle is normal runtime owner.

a20) [have] `Bootstrap`
- One-time or startup seeding from retained/historical data into Oracle state.

a21) [have] `Break-glass`
- Explicit emergency fallback behavior, normally disabled and logged when used.

a22) [have] `Provider circuit`
- Runtime state that tracks provider health and fail-fast/cooldown behavior.

a23) [have] `Egress`
- Outbound/read traffic from Supabase or another provider. In this repo, often discussed as Supabase REST request/traffic cost.

a24) [have] `PWA`
- Installable web app path for BLEUP. Still online-first for authenticated data.

a25) [have] `PA`
- User approval for implementation after a plan.

a26) [have] `PAP`
- Plan approved plus push to GitHub after implementation.

a27) [have] `UDO`
- Approval to run proposed commands/actions without waiting for another confirmation; code changes still require `PA/PAP`.
