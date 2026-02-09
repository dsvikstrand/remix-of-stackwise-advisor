# Prompt to Lovable (patch-only)

```text
Please output a unified diff patch only (do not push commits).

Constraints:
- Keep it small and mechanical (refactor/wrapper/config only).
- Avoid behavior changes unless I explicitly ask.
- Keep `log-event` pinned to Supabase Edge Functions (`/functions/v1/log-event`).

I will batch up to 3 patches per day and apply them to the `lovable-updates` branch.
```
