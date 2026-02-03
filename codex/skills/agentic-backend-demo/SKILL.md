---
name: agentic-backend-demo
description: Demo skill for building and iterating on the agentic backend in this repo. Use when adding or wiring LLM endpoints, switching between mock vs OpenAI providers, updating frontend feature flags (VITE_USE_AGENTIC_BACKEND, VITE_AGENTIC_BACKEND_URL), or preparing a minimal deployment plan (Render + GitHub Pages).
---

# Agentic Backend Demo

## Overview
Follow this workflow to add a new backend endpoint, wire it to the frontend, and validate locally with mock or OpenAI.

## Workflow

### 1) Add or update backend endpoints
- Location: `server/`.
- Add endpoint in `server/index.ts`.
- Keep request/response schemas in `server/llm/types.ts`.
- If LLM call is needed, implement in `server/llm/openaiClient.ts` and reuse prompt builders in `server/llm/prompts.ts`.

### 2) Wire frontend to backend
- Add a feature flag in the UI for safe toggling:
  - `VITE_USE_AGENTIC_BACKEND=true`
  - `VITE_AGENTIC_BACKEND_URL=http://localhost:8787`
- Prefer a single toggle point in the UI (e.g., `src/pages/InventoryCreate.tsx`).

### 3) Run locally (mock or OpenAI)
- Mock mode:
  - `LLM_PROVIDER=mock` then `npm run dev:server`
- OpenAI mode:
  - `OPENAI_API_KEY=...` and optional `OPENAI_MODEL=gpt-5`

### 4) Validate end-to-end
- Open `/inventory/create` and generate.
- Confirm network calls hit `http://localhost:8787/api/...`.

### 5) Prep for deploy
- Backend host (Render): set env vars and CORS.
- Frontend (GitHub Pages): build with `VITE_AGENTIC_BACKEND_URL` pointing to Render.

## References
- Env + flags: `references/env-vars.md`
- Render checklist: `references/render-deploy.md`
- CORS notes: `references/cors.md`
