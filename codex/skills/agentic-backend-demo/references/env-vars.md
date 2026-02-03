# Env Vars

Backend:
- `OPENAI_API_KEY`: OpenAI API key
- `OPENAI_MODEL`: model name (default `gpt-5`)
- `LLM_PROVIDER`: `openai` or `mock`
- `PORT`: server port (default 8787)
- `CORS_ORIGIN`: comma-separated allowed origins

Frontend (Vite build-time):
- `VITE_USE_AGENTIC_BACKEND=true`
- `VITE_AGENTIC_BACKEND_URL=http://localhost:8787` (or Render URL)
