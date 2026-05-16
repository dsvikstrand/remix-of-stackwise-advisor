# Routes And Product Surfaces

Status: `current-session summary`

## Primary Routes

a1) [have] `/`
- Public landing page.
- Benefit-first cold-user entry.
- Primary CTA points toward trying a YouTube URL / starting the product.

a2) [have] `/wall`
- Primary signed-in Home surface.
- Lanes: `For You`, `Joined`, `All`.
- `For You` is the only lane with locked cards.
- Implemented mainly around `src/pages/Wall.tsx`, wall/feed hooks, backend feed routes, and Oracle feed state.

a3) [have] `/search`
- Signed-in Create flow.
- Direct lookup for a specific YouTube URL, video id, or title.
- Not intended as broad infinite YouTube discovery.

a4) [have] `/youtube`
- Manual YouTube-to-blueprint adapter.
- Runs core generation first, optional post-steps after save.
- Current source blueprint shape is `blueprint_sections_v1`.

a5) [have] `/channels`
- Topic/channel discovery.
- Uses backend tag/blueprint-tag APIs for tag data.

a6) [have] `/b/:channelSlug`
- Channel page for published blueprints in one BLEUP channel.

a7) [have] `/s/:platform/:externalId`
- Source Page.
- Current platform is mainly YouTube.
- Public source header and published blueprint feed.
- Authenticated subscribe/unsubscribe.
- Subscriber-only Video Library for optional back-catalog generation.

a8) [have] `/subscriptions`
- Dedicated subscription management.
- Add creator, unsubscribe, refresh new videos, inspect background generation status.
- Large libraries load incrementally.

a9) [have] `/u/:userId`
- Public profile/workspace.
- Tabs: `Feed`, `Comments`, `Liked`.
- Subscription management is not a profile tab.

a10) [have] `/blueprint/:blueprintId`
- Blueprint detail page.
- Prioritizes source-channel attribution for imported YouTube blueprints.

a11) [have] `/my-feed`
- Legacy compatibility route.
- Redirects to `/wall`; not the primary product surface.

## Route Ownership Notes

b1) [have] Browser product-table reads and writes should be minimized for Oracle-owned domains.

b2) [have] Wall/feed data should come from backend-shaped Oracle-aware APIs, not browser-side Supabase fan-out.

b3) [have] Blueprint create/update/save should go through backend `/api/blueprints*` routes.

b4) [have] Tag directory, tag lookup, follows, and blueprint-tag joins should go through `/api/tags*` and `/api/blueprint-tags`.

b5) [have] Like state should resolve through backend Oracle-backed APIs/state, not direct Supabase `blueprint_likes`.

## Important Frontend Areas

c1) [have] `src/pages/Wall.tsx`: Home feed rendering surface.

c2) [have] `src/pages/Search.tsx`: direct video lookup/create flow.

c3) [have] `src/pages/YouTubeToBlueprint.tsx`: manual adapter flow.

c4) [have] `src/pages/Subscriptions.tsx`: subscription management.

c5) [have] `src/pages/SourcePage.tsx`: source creator page.

c6) [have] `src/pages/BlueprintDetail.tsx`: blueprint detail.

c7) [have] `src/pages/Channels.tsx` and `src/pages/ChannelPage.tsx`: channel discovery and channel feeds.

c8) [have] `src/components/feed`, `src/components/wall`, `src/components/blueprint`, `src/components/subscriptions`, `src/components/profile`: main UI component families.

## Important Backend Areas

d1) [have] `server/index.ts`: composition/bootstrap plus major runtime wiring.

d2) [have] `server/routes/*`: modular Express route registration.

d3) [have] `server/handlers/*`: route-heavy domain handlers.

d4) [have] `server/services/*`: orchestration, Oracle state services, feed/generation/subscription services.

d5) [have] `server/contracts/api/*`: backend route contract typing.

d6) [have] `server/transcript/*`: transcript provider/fallback logic.

d7) [have] `server/llm/*`: LLM runtime loading/generation support.

## User-Facing Timestamp Rule

e1) [have] New creator upload -> locked card lands in `For You` quickly when discovered.

e2) [have] Locked card keeps its original wall `created_at` timestamp and sorts by that.

e3) [have] When user generates it, locked card is replaced/upgraded to a generated card.

e4) [have] Generated card gets `generated_at_on_wall` at generation time and sorts by that effective timestamp.

e5) [have] Later enrichment must not keep bumping the generated card.
