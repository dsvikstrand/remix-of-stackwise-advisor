# Terminology Rules (`bleuV1`)

Purpose: enforce language consistency across plans, tasks, PR notes, and reviews.

## Required Terms
- Imported Blueprint
- Insight
- Remix
- My Feed
- Channel Candidate
- Channel Publish

## Prohibited Or Deprecated Phrasing
- "library-first" as primary MVP identity
- "standalone post" as core content model
- conflating channels and tags as equivalent concepts

## Usage Rules
1. Use `Imported Blueprint` for source-derived primary content.
2. Use `Insight` or `Remix` for user-authored add-ons.
3. Use `My Feed` only for personal/private lane semantics.
4. Use `Channel Candidate` before any channel publication claim.
5. Use `Channel Publish` only after gate success.

## Lint-Style Checklist
For any task/PR/review artifact, verify:
- no identity-conflicting term usage
- no ambiguous lane naming
- no implied bypass of candidate gating

## Exception Handling
- Legacy references are allowed only in archived docs under `docs/exec-plans/completed/`.
- If legacy terms are used in active docs, file must be updated in same change set.
