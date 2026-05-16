# New Session Brief

Status: `current-session onboarding`

## BLEUP In One Paragraph

BLEUP is a source-first YouTube-to-blueprint app. Users subscribe to creators or paste a specific YouTube video, and BLEUP turns relevant videos into compact, structured blueprints that land in a feed. The core product is not generic summarization: it combines subscribed-source monitoring, locked cards, async generation, reusable source-video outputs, channel publishing, comments/likes, and topic discovery so users can keep up with creators and topics without watching every full video.

## What Makes It Different From A YouTube Summary App

a1) [have] It is feed-based, not one-off document tooling. New uploads from subscribed creators become locked cards in `For You` as quickly as practical.

a2) [have] It separates discovery and ownership: `For You` is personal source-driven content, while `Joined` and `All` are published blueprint discovery lanes.

a3) [have] Locked cards are first-class UX. They preserve their wall arrival timestamp until generated; the generated card receives a new generated-wall timestamp once.

a4) [have] Generation is durable and queued. User-triggered and background jobs run through worker slots with retries, provider fallbacks, and queue health monitoring.

a5) [have] Outputs are community objects. Users can browse, like, comment, inspect channels, and discover public source pages.

a6) [have] Source identity matters. BLEUP preserves creator/channel context rather than treating every video as an isolated blob of text.

## Current Product Surfaces

b1) [have] `/wall`: primary Home feed with `For You`, `Joined`, and `All`.

b2) [have] `/search`: signed-in Create flow for finding one specific YouTube video.

b3) [have] `/youtube`: manual YouTube-to-blueprint adapter flow.

b4) [have] `/channels` and `/b/:channelSlug`: topic/channel discovery.

b5) [have] `/s/:platform/:externalId`: Source Page for a creator/source, with public blueprint feed and subscriber-only video library.

b6) [have] `/subscriptions`: creator subscription management and refresh flows.

b7) [have] `/u/:userId`: profile workspace with `Feed / Comments / Liked`.

b8) [have] `/blueprint/:blueprintId`: blueprint detail.

## Runtime Architecture Snapshot

c1) [have] Frontend: Vite + React + TypeScript.

c2) [have] Backend: Express server built to `dist/server/index.mjs`.

c3) [have] Oracle production: split systemd services.
- `agentic-backend.service`: HTTP API.
- `agentic-worker.service`: ingestion/background queue work.
- `gpu-runner.service`: separate GPU runner process that may exist alongside the app.

c4) [have] Supabase remains important for auth/session and retained compatibility/managed-service surfaces.

c5) [have] Oracle increasingly owns normal runtime product state through local SQLite/control-plane ledgers.

c6) [have] Current major Oracle modes are expected to be `primary` in production for queue, feed, source items, subscriptions, unlocks, generation state, and scheduler.

## Current Migration Mental Model

d1) [have] The app is Oracle-primary with Supabase compatibility residue, not fully Supabase-free.

d2) [have] Normal runtime for migrated domains should use Oracle-backed APIs/state.

d3) [have] Supabase product-table access that remains should be classified as one of: auth/session, retained owner, bootstrap, compatibility shadow, break-glass, historical migration, or cleanup target.

d4) [have] Tag-family runtime fallback is fail-closed by default. Supabase fallback requires explicit break-glass env and logs `[tag_family_supabase_break_glass]`.

d5) [todo] Remaining ownership-tail areas include source/feed/blueprint residual attribution, YouTube feed soft-failure noise, and governance guardrails for direct Supabase product-table access.

## Working Style For Codex

e1) [have] Follow `AGENTS.md`: plan first for code changes, then wait for `PA`; `PAP` means implement and push; `UDO` allows command execution.

e2) [have] Use Node `20.20.0`.

e3) [have] Never commit `.env` or secrets.

e4) [have] Prefer inspecting current code/live runtime over trusting old plans.

e5) [have] Use `docs/exec-plans/index.md` to know which plans are active, paused, completed, or deserted.

e6) [have] For health checks, use `docs/BLEUP/ops/health-check-playbook.md`.

## First Files To Open

f1) [have] `docs/BLEUP/README.md`

f2) [have] `docs/BLEUP/product/ux-positioning.md`

f3) [have] `docs/BLEUP/ops/oracle-supabase-ownership.md`

f4) [have] `docs/BLEUP/engineering/code-map.md`

f5) [have] `docs/exec-plans/index.md`
