# Plan Authoring Guidelines

This file is the durable planning/governance guide for future implementation plans.

## Purpose
- Keep plans precise, focused, and simple.
- Prefer the smallest root-cause fix that preserves existing working behavior.
- Treat repo debloating as the default direction unless a larger change is clearly necessary.

## Core Rules
- Prefer precise, focused, simple changes over broad new surfaces.
- Before adding new code, verify that the same outcome cannot be achieved by modifying, simplifying, or reusing existing code.
- Default toward reducing complexity, not expanding the repo.
- Preserve existing working functionality whenever possible.
- Do not patch visible symptoms before verifying whether they come from a deeper root cause.
- Treat broad follow-up plans after a small regression as a red flag unless the deeper cause is proven to require broader work.

## Default Bias
- Bias toward editing existing helpers, branches, and contracts before introducing new endpoints, new abstractions, or parallel flows.
- Bias toward one small fix slice at a time.
- Bias toward proving causality before proposing structural cleanup.
- Bias toward removing or simplifying code when that achieves the same result.

## Plan Review Checklist
Before approving a plan, verify:

1. Is this targeting the root cause rather than a downstream symptom?
2. Is the scope proportional to the observed regression?
3. Can the same result be achieved by simplifying or modifying existing code instead of adding new code?
4. Does the plan preserve already-working product behavior?
5. Does the plan avoid introducing new surfaces unless they are clearly necessary?
6. Does the plan move the repo toward lower complexity rather than more?

## Red Flags
- A small regression produces a large architecture plan without a proven causal chain.
- The plan adds new routes, new helpers, or new storage surfaces before existing code paths are fully inspected.
- The plan fixes UI symptoms without confirming backend state truth first.
- The plan duplicates logic that already exists elsewhere in the repo.
- The plan increases moving parts before simpler edits have been ruled out.

## Approval Gate
- Plans should explain why the proposed change is the smallest credible root-cause fix.
- If a broader plan is proposed, it should explicitly explain why a smaller edit to existing code is not enough.
- If that proof is missing, the plan should be narrowed before implementation starts.
