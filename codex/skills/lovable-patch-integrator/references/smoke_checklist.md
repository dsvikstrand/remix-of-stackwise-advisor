# Smoke checklist (lovable-updates only)

Fast gates (required):
1) `npm run build`

Optional sanity (recommended, but can be skipped until end-of-day):
2) Load the app locally or on Pages preview and confirm no console errors on:
- Home
- Library
- Blueprints

Notes:
- Anything that changes API routing needs a network sanity check.
- If smoke fails, revert the last commit on `lovable-updates` and isolate the patch.
