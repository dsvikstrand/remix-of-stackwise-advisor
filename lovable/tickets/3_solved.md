## Ticket: preferred categories for inventory generation

Please update and redeploy the Edge Function:
- supabase/functions/generate-inventory/index.ts

Change summary:
- The client now sends `preferredCategories` (string array) in the request body.
- The generator should include these categories exactly as written and still return exactly 6 categories total (auto-fill remaining if fewer than 6).

Please deploy and confirm it’s live.

Acceptance criteria:
- Always return exactly 6 categories total.
- preferredCategories must appear verbatim in the output.
- If preferredCategories has fewer than 6 items, auto-fill the remaining categories.
