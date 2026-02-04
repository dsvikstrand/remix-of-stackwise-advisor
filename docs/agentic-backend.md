# Agentic Backend (OpenAI Wrapper)

## Goal
Provide a thin, swappable backend client that can call OpenAI (or a mock) without changing the frontend flow.

## Local Dev
1) Set env vars (in your shell):
- `OPENAI_API_KEY`
- `OPENAI_MODEL` (optional, default `gpt-4.1-mini`)
- `PORT` (optional, default `8787`)
- `CORS_ORIGIN` (optional, comma-separated)
- `SUPABASE_URL` (required for auth introspection)
- `SUPABASE_ANON_KEY` (required for auth introspection)
- `RATE_LIMIT_WINDOW_MS` (optional, default `60000`)
- `RATE_LIMIT_MAX` (optional, default `60` per IP per window)

2) Start the backend:
```
npm run dev:server
```

3) Point the frontend to it:
- Set `VITE_USE_AGENTIC_BACKEND=true`
- Set `VITE_AGENTIC_BACKEND_URL=http://localhost:8787`
- The frontend sends `Authorization: Bearer <supabase access token>` when using the agentic backend

## Endpoints
- `POST /api/generate-inventory` → JSON inventory schema
- `POST /api/analyze-blueprint` → SSE stream of blueprint review markdown
- `GET /api/health`

## Notes
- If you want a non-LLM demo, set `LLM_PROVIDER=mock`.
