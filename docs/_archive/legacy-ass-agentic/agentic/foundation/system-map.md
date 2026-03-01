# bleuV1 System Map

## Runtime Topology (Current)
Frontend
- React + Vite app.
- Current surfaces:
  - `/wall`, `/explore`, `/channels`, `/b/:channelSlug`, `/blueprint/:blueprintId`, `/youtube`.

Backend
- Express app under `server/index.ts`.
- Generation endpoint in production: `/api/youtube-to-blueprint`.

Data and identity
- Supabase stores blueprints, tags, follows, likes/comments, profiles, telemetry.

Eval policy assets
- Eval method packs in `eval/methods/v0/*`.

Operations
- Runbook and smoke flows under `docs/ops/` and `scripts/`.

## Planned Additions (Spec-Only, Not Implemented Yet)
1. My Feed route/surface
- Planned route target: `/my-feed` (or equivalent final IA route).
- Role: personal/private lane for pulled content and channel-rejected items.

2. Ingestion loop boundary
- Scheduler/poller for followed YouTube channels.
- Creates source-item candidates and generation jobs.

3. Channel candidate decision boundary
- Evaluate candidate eligibility before shared channel publish.

## Adapter Boundary Contract
Input
- Adapter fetches source metadata/transcript from a source URL or followed source channel.

Normalization
- Normalize to canonical `SourceItem` representation with stable identity.

Generation
- Convert normalized source input into an imported blueprint.

Distribution
- Publish to My Feed first.
- Optionally promote to channel through gates.

## Planned API Interface Group (Spec-Only)
These interfaces are planned for implementation phase and are not implemented yet.

Source subscription interfaces
- `POST /api/source-subscriptions`
- `GET /api/source-subscriptions`
- `DELETE /api/source-subscriptions/:id`

Ingestion job interfaces
- `POST /api/ingestion/jobs/trigger`
- `GET /api/ingestion/jobs/:jobId`

Channel candidate decision interfaces
- `POST /api/channel-candidates/:id/evaluate`
- `POST /api/channel-candidates/:id/publish`
- `POST /api/channel-candidates/:id/reject`

## Integration Points
Frontend to backend
- Source follow management UI.
- My Feed and candidate promotion actions.

Backend to eval policies
- Gate-class execution for channel decisions.

Backend to Supabase
- Persist source item identity, feed item state, gate decision logs.

## Dependency Summary
- Product behavior source of truth: `docs/app/product-spec.md`.
- Architecture source of truth: `docs/architecture.md`.
- Foundation execution plan: `docs/exec-plans/active/project-bleuv1-mvp-foundation.md`.
