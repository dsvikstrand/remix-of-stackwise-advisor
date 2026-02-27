# Golden BP Prompt Contract v1

Version: `v1`  
Status: Canonical (current)  
Last updated: 2026-02-27  
Owner intent: Build blueprints people choose to read for value, not because they are testing the app.

## Change Log

- `v1` (2026-02-27): Introduced canonical prompt contract with strict section semantics, Reddit vibe-only policy, and representation pass/fail guidance.
- `v1.1` (2026-02-27): Added canonical POS folder strategy (local + Oracle path), cherry-pick subset guidance, and final generation directive layer.
- `v1.2` (2026-02-27): Replaced placeholder/order prose sections with deterministic enforcement contract, moved changelog to top, and added final job recap.

## Purpose

This document is the canonical writing and quality contract for Golden Blueprint generation in Bluep. It defines what a blueprint is, how it should feel, how each section should behave, how Reddit references can be used safely for vibe calibration, and how reviewers should score quality before we call output acceptable.

This is a product-quality contract, not a database schema or API contract. It is designed to keep generation consistent and readable while still leaving room for domain adaptation.

## What Bluep Is

Bluep is a community-driven blueprint reading product where people discover source-grounded summaries, react to them, and discuss them. The social loop is built around usefulness: if a blueprint is clear, specific, and worth talking about, likes/comments follow naturally. If it reads like generic AI text, engagement drops even when facts are technically correct.

The trust model is simple: users know content is AI-assisted, so the product does not need to hide authorship. Trust is earned through clarity, fidelity to source, practical value, and honest boundaries.

## What a Blueprint Is

A blueprint is a compressed value artifact made from a source video transcript. It is not a transcript rewrite, not a Reddit-style personal post, and not a generic top-level summary. A strong blueprint should let the reader say, "I got the core value fast, I understand the decision logic, and I know what to do next."

Blueprints are optimized for two reading modes: a fast skim that still yields value and a fuller read that provides deeper reasoning. Content should be compact, but never shallow or placeholder-like.

## Human Vibe Principle

The target voice is person-to-person, creator-like, and grounded. It should sound like a strong explainer talking to an informed reader, not like a template engine output. The writing should carry rhythm and intent, with concrete wording and clean transitions.

The tone must stay useful over polished. If a sentence sounds impressive but does not add actionable or interpretive value, it should be removed or rewritten. Confidence should be calibrated: state what is known, what is likely, and what remains uncertain without hedging every line.

## Strict Rule Sets

### Output style rules

Write in direct creator voice and avoid meta framing like "this video," "this blueprint," or "the transcript." Every paragraph must carry useful payload and connect to a coherent point, not a random fact stream. Use concrete language and domain-native wording. Avoid recycled boilerplate, vague abstractions, and interchangeable AI phrasing.

When bullets are used, each bullet must be complete and readable on its own. A complete bullet states the core claim, explains why it matters in context, and ends with a practical implication. Bullet fragments, clipped lines, and stub artifacts are invalid output.

### Golden structure target

The default section sequence is `Takeaways`, `Bleup`, `Deep Dive`, `Tradeoffs`, `Practical Rules`, and `Open Questions`, with optional domain adaptation for non-research content only when semantic intent is preserved. `Takeaways` is the fast-value entry point. `Bleup` is the core narrative section that carries the main argument in flowing prose. The remaining sections convert understanding into mechanism clarity, tradeoff framing, execution rules, and explicit unknowns.

Sections must not duplicate each other semantically. If a sentence appears in one section, it should not reappear with minor wording changes elsewhere.

### Hard constraints

Output must be strict valid JSON in the expected generation schema. Section titles must be explicit and useful. Tags must stay broad, human-searchable, and capped at five. Obscure niche tags that typical users would not search are disallowed. Personal data is never allowed. Timestamps are optional and should be null when unknown.

All deep sections target three to five complete bullets each. Empty sections, one-line placeholders, repeated boilerplate tails, and malformed bullets (for example `-.`) are hard failures.

## Section Contract

### Takeaways

Takeaways is the highest-value skim section and should deliver immediate payoff in three to four complete bullets. Each bullet must stand alone and give the reader one meaningful thing they can retain or use right away. This section is not a keyword list and not a teaser. It should read like distilled insight with practical consequence. Depth should be concise but non-trivial: enough specificity to be useful, short enough to scan in seconds.

### Bleup

Bleup is the narrative core and should read like a coherent mini-essay in three to four short paragraphs. It carries the main through-line: what matters, why it matters, and how to interpret it in practice. This section should feel human, connected, and intentional, not stitched together from note fragments. It should not degrade into bullet artifacts or duplicate sentences from Takeaways. Target depth is enough for a full read to feel satisfying without requiring the original video.

### Deep Dive

Deep Dive explains mechanism and reasoning. It should provide three to five complete bullets that show how or why outcomes happen, under what conditions they hold, and where boundaries appear. Language should stay domain-native and specific to the topic, not generic framework filler. This section should make the reader feel more precise, not simply more verbose.

### Tradeoffs

Tradeoffs clarifies the upside, constraints, and uncertainty in concrete terms. It should provide three to five complete bullets that help the reader avoid simplistic conclusions. This is where nuance becomes decision-useful: what improves, what remains limited, and what depends on context. The tone should be honest and practical, never performatively cautious.

### Practical Rules

Practical Rules turns understanding into repeatable action. It should provide three to five complete bullets that a reader can apply without guesswork. Rules should be operational, ideally in simple conditional framing when helpful, and should reduce ambiguity rather than introduce it. This section should prioritize real-world decision clarity over motivational language.

### Open Questions

Open Questions defines what remains unresolved in a useful way. It should provide three to five concrete questions that matter for interpretation, implementation, or confidence. Questions should be specific enough to guide future thinking and should avoid generic placeholders like "more research is needed." This section preserves intellectual honesty while keeping momentum.

## Representation Contract (Shape and Completeness)

| Section | Required shape | Depth target | Fail conditions |
|---|---|---|---|
| `Takeaways` | 3-4 complete bullets | fast-skim value in ~10 seconds | clipped bullets, generic labels, keyword-only lines |
| `Bleup` | 3-4 coherent paragraphs | primary narrative payload | random fact stacking, duplicated lines, list artifacts |
| `Deep Dive` | 3-5 complete bullets | mechanism/context clarity | generic off-domain bullets, stubs, repeated boilerplate tails |
| `Tradeoffs` | 3-5 complete bullets | upside/constraint/unknown balance | one-sided framing, vague caveats, duplicated bullets |
| `Practical Rules` | 3-5 complete bullets | actionable decisions | non-operational advice, abstract slogans |
| `Open Questions` | 3-5 complete bullets | meaningful unknowns | generic filler questions, repeated "why it matters" tails |

All sections must be semantically complete, domain-consistent, and non-redundant.

## Reddit Reference Policy (Vibe Only, Never Content)

Positive Reddit examples are allowed as style calibration inputs for feel, pacing, readability, and engagement energy. They are not allowed as content sources. We borrow narrative signal, not facts.

Transcript fidelity is absolute. If style and transcript ever conflict, transcript wins. Facts, claims, numbers, examples, and wording must originate from the source transcript, not Reddit references.

## How to Use Reddit References Safely

Use a small curated set of positive references to derive a short "vibe profile" before generation. That profile should describe traits like payoff-first opening, concrete interpretation, grounded confidence, and readable flow. It should not include topic claims or copied lines.

Worked example: if Reddit positives show "claim -> evidence -> implication" pacing, apply that pacing to blueprint writing, but populate each claim and implication only from transcript-grounded facts. If a Reddit post uses a memorable phrase, do not copy the phrase; recreate the clarity pattern in fresh wording tied to the source material.

## Context Vibe Input (Runtime Guidance with Placeholders)

Use this section as the runtime context envelope for generation input. The goal is to combine transcript-grounded truth with vibe calibration from strong Reddit positives, without content leakage.

The input should always carry two explicit sources. First source is transcript truth context, represented with placeholders like `<VIDEO_URL>`, `<VIDEO_TITLE>`, `<TRANSCRIPT_SOURCE>`, and `<SOURCE_TRANSCRIPT_CONTEXT>` (full transcript or approved excerpt window). Second source is vibe calibration context, represented with placeholders like `<POSITIVE_REFERENCE_SET_DESCRIPTION>` and `<POSITIVE_REFERENCE_PATHS>`, where references point to one canonical POS folder.

Canonical POS folder paths:
- Local repo path: `docs/golden_blueprint/reddit/clean/pos`
- Oracle live path: `/home/ubuntu/remix-of-stackwise-advisor/docs/golden_blueprint/reddit/clean/pos`

Use a cherry-picked subset per run, not the full folder. The recommended subset size is 3-5 references selected to match the current topic vibe. Pass selected references as `<POSITIVE_REFERENCE_PATHS>` and include a one-line reason for each selection in `<POSITIVE_REFERENCE_SET_DESCRIPTION>`.

The instruction framing should stay human and direct. It should tell the model that Bluep is a community-driven reading product and that writing should feel engaging enough that the same kind of users who engage with those reference posts would also want to read and comment here. It should also state that references are for tone, pacing, and engagement feel only.

Guardrails must be explicit and non-negotiable: all factual claims must come from `<SOURCE_TRANSCRIPT_CONTEXT>` only, and no facts, numbers, examples, topic claims, or distinctive phrasing may be imported from Reddit references. If there is any conflict between vibe pressure and transcript fidelity, transcript fidelity wins.

The assembly order should be stable: transcript truth block first, vibe reference block second, hard constraints third, and final output instruction last. This ordering prevents style calibration from overriding source-grounded content.

For operational consistency, include a brief engagement check sentence in the context layer, such as asking whether the draft would feel useful, specific, and discussion-worthy to the same audience profile as the positive references, while still being fully source-faithful to `<SOURCE_TRANSCRIPT_CONTEXT>`.

## Input Placeholders Contract (Required at Runtime)

The runtime prompt template must be rendered with explicit placeholders before each generation run. Required placeholders are `<VIDEO_URL>`, `<VIDEO_TITLE>`, `<TRANSCRIPT_SOURCE>`, `<SOURCE_TRANSCRIPT_CONTEXT>`, `<ORACLE_POS_DIR>`, and `<POSITIVE_REFERENCE_SET_DESCRIPTION>`. Optional placeholders are `<ADDITIONAL_INSTRUCTIONS>`, `<QUALITY_ISSUE_CODES>`, and `<QUALITY_ISSUE_DETAILS>` for retries.

`<SOURCE_TRANSCRIPT_CONTEXT>` should contain the transcript window selected for generation and must remain the only factual source of truth. `<ORACLE_POS_DIR>` should point to `/home/ubuntu/remix-of-stackwise-advisor/docs/golden_blueprint/reddit/clean/pos`. `<POSITIVE_REFERENCE_SET_DESCRIPTION>` should briefly state why selected references fit the current run's vibe target.

## Deterministic Enforcement Contract

These rules are deterministic checks, not optional writing guidance. Runtime should enforce them with explicit fail reasons and no silent bypass.

Required deterministic checks:
- Placeholder completeness: fail if any required placeholder is missing or empty at render time.
- Section order: fail if output does not follow canonical order (`Takeaways`, `Bleup`, `Deep Dive`, `Tradeoffs`, `Practical Rules`, `Open Questions`).
- Density checks: fail if `Takeaways` is not 3-4 complete bullets, if `Bleup` is not 3-4 coherent paragraphs, or if deep sections are outside 3-5 complete bullets.
- Completeness checks: fail malformed bullets, clipped fragments, duplicated headers, and repeated boilerplate tails.
- Source hierarchy checks: fail if content appears to import factual payload from vibe references instead of transcript context.

## No-Duplication Rule

Do not repeat the same sentence or near-identical idea across sections. If an idea appears in one section, later sections must extend or contextualize it rather than restate it.

## Domain-Language Rule

Use language that belongs to the topic domain of the transcript. Avoid cross-domain template bleed (for example, health-style "protocol" framing in finance, or finance-style abstraction in recipes). Section wording must feel native to the subject matter.

## Transcript Precedence Rule

Transcript context is the top authority for all factual statements. Vibe references can shape tone and readability only. If there is any ambiguity, choose transcript fidelity over stylistic flourish.

## Retry Patch Slot (Same Template, Different Context)

Retries should use the same prompt template and inject quality issues through `<QUALITY_ISSUE_CODES>` and `<QUALITY_ISSUE_DETAILS>`. The retry context should request one-pass repair of all listed failures while preserving transcript fidelity and the section contract.

## Final Generation Directive (Last Instruction Layer)

End the prompt context with a short final directive that reasserts the job and source hierarchy. The directive should explicitly say that the model must now generate the blueprint using `<SOURCE_TRANSCRIPT_CONTEXT>` as the only factual source, while using `<POSITIVE_REFERENCE_PATHS>` only for vibe calibration (tone, pacing, and engagement feel). It should explicitly ban importing facts, numbers, examples, and distinctive wording from references. It should end with a clear "generate now" instruction tied to the required JSON schema and section contract.

## Response Format (Strict JSON Shape)

The rendered prompt must include the required output shape and must reject non-JSON output.

```json
{
  "title": "string",
  "description": "string",
  "steps": [
    { "name": "string", "notes": "string", "timestamp": "string|null" }
  ],
  "notes": "string|null",
  "tags": ["string"]
}
```

## Known Slop Patterns and Rewrite Guidance

### Repetition and near-duplication

Symptom: repeated sentence meaning across sections and recurring boilerplate endings.  
Rewrite direction: collapse duplicates, keep strongest version once, and add section-specific interpretation instead of restating.

### Clipped or fragmented bullets

Symptom: bullets cut mid-thought or split by punctuation artifacts.  
Rewrite direction: force complete sentence-level bullets with one clear claim and one practical implication.

### Duplicate headers or section echo

Symptom: repeated title text inside the same section or mirrored section labels in content body.  
Rewrite direction: keep heading metadata separate from body content and strip echoed labels from generated text.

### Generic boilerplate tails

Symptom: repeated low-information endings like universal "why it matters" lines on every bullet.  
Rewrite direction: replace with topic-specific implications tied to real transcript context.

### Domain drift

Symptom: health-style "protocol" language in finance content, or other cross-domain template bleed.  
Rewrite direction: enforce domain-native vocabulary and decision framing per topic.

## Quality Review Checklist (Manual Pass)

1. Reader gets real value in under 10 seconds from `Takeaways` alone.  
2. `Bleup` reads as coherent flowing prose, not stitched fragments.  
3. Deep sections contain complete, non-generic, domain-appropriate bullets (3-5 each).  
4. No duplicated headers, no clipped bullets, no repeated boilerplate tails.  
5. Writing feels human and grounded, not templated AI prose.  
6. Reddit influence is visible as vibe only; all facts remain transcript-grounded.  
7. Tags are broad, searchable, and capped at five.  
8. Section order and representation match the contract.

## Acceptance Criteria for This Contract

- A reviewer can evaluate any generated blueprint against this document without guessing intent.  
- Section behavior is explicit enough to define pass/fail decisions.  
- Human-vibe guidance is present without weakening source fidelity constraints.  
- Reddit usage rules prevent content leakage while preserving engagement signal.

## Final Job Recap

Write a high-value blueprint in direct creator voice that feels human, useful, and discussion-worthy. Use transcript context as the only factual source, use Oracle POS references only for vibe calibration, follow the section contract exactly, and return strict JSON in the required shape.
