# Invariants

These are non-negotiable unless the user explicitly requests a change.

1) `main` is not touched by this skill.
- This skill only modifies/pushes `lovable-updates`.

2) Patch-only from Lovable.
- Lovable outputs unified diffs.
- We apply them locally.

3) Logging stability.
- `log-event` must always route to Supabase Edge Functions (`/functions/v1/log-event`).
- It must not depend on the agentic backend toggle.

4) No secrets.
- Never commit tokens or `.local` files.
