# UX And Product Positioning

Status: `current-session summary`

## One-Line Positioning

BLEUP helps people keep up with YouTube creators and topics by turning new and selected videos into compact, actionable blueprints inside a personal and community feed.

## Core Promise

a1) [have] Users should understand BLEUP as:

> A feed for staying current with the best ideas from the YouTube creators and topics you care about, without watching every full video.

a2) [have] The product should not be framed as:
- a generic YouTube summarizer
- a note-taking app
- a creator analytics tool
- a downloader
- a generic chat-with-video tool

## Why Users Should Use It

b1) [have] They follow too many creators and cannot keep up.

b2) [have] They care about high-signal topics such as AI, health, investing, productivity, cooking, learning, or self-improvement.

b3) [have] They want practical takeaways quickly, but still want source context and community discovery.

b4) [have] They want a persistent feed of relevant videos, not a pile of disconnected summaries.

b5) [have] They want to see what other users are pulling into their walls, liking, and discussing.

## Differentiators

c1) [have] Feed-native: content lands in `For You`, `Joined`, `All`, channels, source pages, and profiles.

c2) [have] Source-aware: blueprints retain YouTube creator/source identity and source-page context.

c3) [have] Locked-card model: new videos can land as unlockable cards before generation, so the wall shows what is available even when generation happens later.

c4) [have] Durable async generation: queue, worker, provider fallback, retry, credits, and status handling are part of the product.

c5) [have] Community layer: users can like, comment, browse channels, and inspect public blueprints.

c6) [have] Reusable generation: one source video can have reusable ready output across subscribers when applicable.

## Core Feed UX

d1) [have] `For You` is personal and source-driven. It can contain locked/unlockable source items and generated/published blueprints.

d2) [have] `Joined` is an authenticated discovery lane for published blueprints in channels the user joined.

d3) [have] `All` is the global published-blueprint stream.

d4) [have] Locked cards belong only in `For You`.

d5) [have] Generated cards should use the effective wall timestamp: `generated_at_on_wall || created_at`.

d6) [have] Clicking the signed-in BLEUP logo on `/wall` resets Home to the user's default lane and scrolls to top.

## Launch Framing

e1) [have] Clear external description:

> BLEUP turns your favorite YouTube creators into a compact insight feed. Subscribe to creators, see new videos as cards, generate the key ideas, and discover what the community is watching.

e2) [have] Short launch angle:

> For people who use YouTube to learn, but do not have time to watch everything.

e3) [have] Avoid overpromising:
- do not claim perfect transcripts
- do not claim every YouTube video is supported
- do not claim real-time ingest for all creators
- do not call it a replacement for watching videos

e4) [have] Emphasize:
- fast understanding
- feed-based workflow
- source subscriptions
- community discovery
- compact blueprints

## Current Product Constraints

f1) [have] YouTube is the required MVP adapter; broader adapters are deferred.

f2) [have] Transcript availability can fail by provider/video. Native YouTube timed text is opportunistic; fallback providers handle many cases but not all.

f3) [have] YouTube feed polling can produce soft `404/500` noise for some channels without breaking app runtime.

f4) [have] BLEUP is online-first. PWA install exists, but authenticated data still depends on backend/network.
