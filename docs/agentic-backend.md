# Agentic Backend (OpenAI Wrapper)

## Goal
Provide a thin, swappable backend client that can call OpenAI (or a mock) without changing the frontend flow.

## Local Dev
1) Set env vars (in your shell):
- `OPENAI_API_KEY`
- `OPENAI_MODEL` (optional, default `gpt-5`)
- `PORT` (optional, default `8787`)
- `CORS_ORIGIN` (optional, comma-separated)
- `AGENTIC_API_KEY` (optional but recommended; enables X-API-Key auth)

2) Start the backend:
```
npm run dev:server
```

3) Point the frontend to it:
- Set `VITE_USE_AGENTIC_BACKEND=true`
- Set `VITE_AGENTIC_BACKEND_URL=http://localhost:8787`
- Set `VITE_AGENTIC_BACKEND_API_KEY` to match `AGENTIC_API_KEY` for local dev only

## Endpoints
- `POST /api/generate-inventory` → JSON inventory schema
- `GET /api/health`

## Notes
- If you want a non-LLM demo, set `LLM_PROVIDER=mock`.
