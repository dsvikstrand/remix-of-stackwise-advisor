# Seed Secrets v0 (Local Only)

Goal: store headless persona credentials in a single, explicit file keyed by persona id.

This is for local/Oracle seeding runs only. Do not commit this file.

## File

- `seed/secrets.local.json` (gitignored)

## Shape

```json
{
  "version": 0,
  "personas": {
    "skincare_diet_female_v0": { "email": "user@example.com", "password": "..." },
    "strength_training_male_v0": { "email": "user2@example.com", "password": "..." }
  }
}
```

## Rules

- Key by persona id (must match `personas/v0/<persona_id>.json`).
- Keep `seed/secrets.local.json` as the single source of truth for persona bootstrapping.
- Generate `personas/auth_local/<persona_id>.env.local` from this file using:
  - `seed/scripts/sync_persona_auth_env.ts`
- The runner maintains rotating tokens in `seed/auth/<persona_id>.local` automatically.
  - Stored at `personas/auth_local/<persona_id>.local` (per `seed/persona_registry_v0.json`).
