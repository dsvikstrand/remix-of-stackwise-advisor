# GitHub Pages: Main + Agentic Branches

## Live URLs
- Main (Lovable-synced): https://dsvikstrand.github.io/remix-of-stackwise-advisor/
- Agentic backend: https://dsvikstrand.github.io/remix-of-stackwise-advisor/agentic-backend/

## Branch Mapping
- `main` builds to the root of `gh-pages`.
- `agentic-backend` builds to `gh-pages/agentic-backend/`.

## How It Works
- The workflow builds with `VITE_BASE_PATH` to set the correct base URL per branch.
- `public/404.html` + a small script in `index.html` handle SPA deep links (e.g., `/wall`).

## Required GitHub Pages Setting
- Settings → Pages → **Deploy from a branch**
- Branch: `gh-pages`
- Folder: `/ (root)`

## Troubleshooting
- **Blank page or app 404 on `/agentic-backend/*`**: base path not set or wrong workflow deployed.
- **`npm ci` fails**: update lockfile with `npm install --package-lock-only` and commit `package-lock.json`.
- **Deep links 404**: confirm `public/404.html` exists and is deployed for both branches.
