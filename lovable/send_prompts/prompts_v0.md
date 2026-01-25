Please redeploy the Edge Function:

- supabase/functions/generate-inventory/index.ts

We updated the generation prompt to default to general item names and only become highly specific if the user explicitly asks for specificity. Also added “avoid brand names unless requested.”

Please confirm once the function is live.

## Prompt: enforce bullet formatting in analyze-blueprint

Please update the Edge Function prompt at:
- supabase/functions/analyze-blueprint/index.ts

Change the system prompt so that Strengths, Gaps / Risks, and Suggestions always use list items that begin with a dash (`- `). Do not use `+`, `*`, or paragraph-style items for those sections.

Specifically:
- Under **Strengths**, each item should be on its own line and start with `- `.
- Under **Gaps / Risks**, each item should be on its own line and start with `- `.
- Under **Suggestions**, each item should be on its own line and start with `- `.

This is to ensure the frontend parser renders these sections correctly.

Please deploy the updated function and confirm it’s live.


## Prompt: inventory review sections (DB + edge function)

Please apply the following changes so inventory-defined review sections work end-to-end:

1) Apply migration:
- supabase/migrations/20260125170000_add_inventory_review_sections.sql

2) Deploy Edge Function update:
- supabase/functions/analyze-blueprint/index.ts
- It now accepts `reviewSections` from the client and uses those headings (fallback to default: Overview, Strengths, Gaps, Suggestions).

3) Regenerate Supabase types after migration.

Please confirm when these are live.

Note: The client now sends `reviewSections` (string array) in the analyze-blueprint request body. Please verify this is accepted and the headings in the response match that order.
