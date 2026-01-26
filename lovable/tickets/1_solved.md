## Ticket: update generate-inventory to accept custom instructions

Please update and redeploy the Edge Function:
- supabase/functions/generate-inventory/index.ts

Change summary:
- The client now sends `customInstructions` (string) in the request body.
- The function should include this text in the user prompt when present ("Additional instructions: ...").

Please deploy the updated function and confirm it’s live.
