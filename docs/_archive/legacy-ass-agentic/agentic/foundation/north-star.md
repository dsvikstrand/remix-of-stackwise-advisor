# bleuV1 North Star

## Product Promise
`bleuV1` turns media into bite-sized blueprints and enriches them with community insights.

## One-Line Promise Variants
- Variant A: Bite-sized blueprints from your favorite media, enriched by community insights.
- Variant B: Pull media into your feed as actionable blueprints, then learn from community opinions.
- Variant C: A personal media-to-blueprint feed that becomes smarter through shared discussion.

Chosen final promise:
- Bite-sized blueprints from your favorite media, enriched by community insights.

## Target User Archetypes
1. Curator
- Wants practical, distilled content from trusted creators without watching full videos.
- Values speed and relevance.

2. Practitioner
- Wants to apply routines/guides immediately and save reusable steps.
- Values clarity and actionability.

3. Community Refiner
- Wants to add opinions, corrections, and remixes to improve shared quality.
- Values contribution and social proof.

## Primary Job To Be Done
When users follow media sources, they want an always-fresh feed of actionable blueprints so they can learn and apply content quickly while benefiting from community refinements.

## Secondary Jobs
- Keep track of relevant content in one place.
- Promote high-quality items into shared channels.
- Contribute context without writing standalone long-form posts.

## Locked Defaults (Decision Lock)
- Adapter scope for MVP: YouTube only.
- My Feed visibility default: personal/private lane.
- Channel publish mode default: selected/manual approve path.
- User content in MVP: insight/remix attached to imported blueprints only.
- Low-confidence channel candidates: blocked from channel and retained in My Feed.
- Manual checkpoints: maximum three stop-and-inspect checkpoints per milestone.
- Orchestration control plane: CLI-first (`codex exec`) + GitHub Actions.

## Success Criteria
Product clarity and retention
- Users can explain the app in one sentence after first session.
- Users return because feed freshness and quality are visible.

MVP behavior quality
- Imported blueprint flow is reliable enough for daily use.
- Channel feeds remain cleaner than My Feed due to gate enforcement.

Community quality
- Insights/remixes improve signal without replacing source-first identity.

## Anti-Goals
- Becoming a generic free-form posting or blog platform in MVP.
- Expanding to multi-adapter scope before YouTube flow is stable.
- Removing human governance entirely from high-risk decisions.

## Scope Note
Planned interfaces and process contracts described in this phase are spec-only unless explicitly labeled as implemented in canonical runtime docs.
