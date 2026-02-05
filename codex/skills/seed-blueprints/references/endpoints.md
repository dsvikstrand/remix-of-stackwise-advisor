# Agentic Endpoints (Stage 0)

## Agentic backend
- `POST /api/generate-blueprint`
  - Body:
    ```json
    {
      "title": "...",
      "description": "...",
      "notes": "...",
      "inventoryTitle": "...",
      "categories": [{"name": "...", "items": ["..."]}]
    }
    ```
  - Returns:
    ```json
    { "title": "...", "steps": [ { "title": "...", "description": "...", "items": [ {"category": "...", "name": "...", "context": "..."} ] } ] }
    ```

- `POST /api/generate-inventory`
  - Body:
    ```json
    { "keywords": "...", "title": "...", "customInstructions": "...", "preferredCategories": ["..."] }
    ```

## Notes
- Stage 0 uses these endpoints and stores JSON outputs only.
