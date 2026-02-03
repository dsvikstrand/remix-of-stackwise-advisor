# Agentic Backend (OpenAI Wrapper)

## Goal
Provide a thin, swappable backend client that can call OpenAI (or a mock) without changing the frontend flow.

## Local Dev
1) Set env vars (in your shell):
- `OPENAI_API_KEY`
- `OPENAI_MODEL` (optional, default `gpt-5`)
- `PORT` (optional, default `8787`)
- `CORS_ORIGIN` (optional, comma-separated)

2) Start the backend:
```
npm run dev:server
```

3) Point the frontend to it:
- Set `VITE_USE_AGENTIC_BACKEND=true`
- Set `VITE_AGENTIC_BACKEND_URL=http://localhost:8787`

## Endpoints
- `POST /api/generate-inventory` → JSON inventory schema
- `GET /api/health`

## Notes
- If you want a non-LLM demo, set `LLM_PROVIDER=mock`.
