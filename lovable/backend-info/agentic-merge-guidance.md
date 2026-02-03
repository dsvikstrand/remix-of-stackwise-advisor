# Agentic Backend Branch Guidance

This repo now uses a two-branch workflow so we can evolve the backend independently while Lovable continues to ship UI updates.

## Branch Strategy
- `main` is the Lovable-synced branch (source of truth for UI updates).
- `agentic-backend` is the long-running branch for backend/orchestration work.
- We regularly merge `main` into `agentic-backend` to keep the backend branch current.
- When backend work is ready, we merge `agentic-backend` back into `main`.

## Safe Zones for Lovable Updates
To keep merges clean, please focus changes in these areas:
- UI components: `src/components/**`
- Pages and routing: `src/pages/**`, `src/App.tsx`
- Styling: `src/index.css`, `src/App.css`, `tailwind.config.ts`
- Client-side hooks and UI data wiring: `src/hooks/**`

## Please Avoid (or Coordinate) These Areas
These are being reworked for the agentic backend:
- `supabase/functions/**`
- `src/integrations/lovable/**`
- Any new backend folder we add (e.g., `server/`, `api/`, `apps/api/`)

If you must edit these, flag it so we can align changes before the next merge.

## Merge Workflow (Minimal Friction)
- Lovable continues pushing to `main`.
- We pull from `main` into `agentic-backend` on a regular cadence.
- Conflicts should be rare if backend changes stay isolated.
- If conflicts happen in shared files, prefer UI changes from `main` and re-apply backend adjustments if needed.

## Notes
- New backend work will be isolated into new folders to avoid touching Lovable-managed files.
- When we switch the frontend to the new backend, we will keep the change localized (ideally a single integration entry point).
