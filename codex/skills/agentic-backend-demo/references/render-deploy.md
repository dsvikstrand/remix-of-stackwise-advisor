# Render Deploy Checklist

1) Create a new Web Service.
2) Root directory: repo root (or configure a subdir if you split backend later).
3) Build command: `npm install`.
4) Start command: `npm run dev:server` (or replace with a prod server command later).
5) Add env vars (see env-vars.md).
6) Ensure CORS allows your GitHub Pages origin.
