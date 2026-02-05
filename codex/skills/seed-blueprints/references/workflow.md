# Stage 0 Workflow (Linear)

1. Read `seed/seed_spec_v0.json`.
2. Call `generate-inventory` using `library.topic` + `library.title` + `library.notes`.
3. For each blueprint variant:
   - Call `generate-blueprint` with variant title/description/notes and the library categories.
4. Save outputs into `seed/outputs/<run_id>/`.
5. Validate that all items in blueprint steps exist in the library categories.

**No DB writes in Stage 0.**
