# Golden BP Prompt Contract v3

Version: `v3`
Status: Canonical (current)
Owner intent: Generate high-value blueprints with a stable Bluep quality stamp and a stricter JSON contract.


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

When bullets are used, each bullet must be complete and readable on its own. A complete bullet states the core claim, explains why it matters in context, and ends with a practical implication. Bullet fragments, clipped lines, and stub artifacts are invalid output.

Keep bullets tight. `Takeaways`, `Deep Dive`, `Practical Rules`, and `Open Questions` bullets should be one to two sentences max. Do not write paragraph-length bullets.

### Golden structure target

The required section sequence is `Summary`, `Takeaways`, `Storyline`, `Deep Dive`, `Practical Rules`, and `Open Questions`. All six are mandatory. If any required section is missing or empty, the output is considered a failed generation and should be retried. `Summary` is the intro context layer, `Takeaways` is the fast-value entry point, `Storyline` is the core narrative section, and the remaining sections convert understanding into mechanism clarity, execution rules, and explicit unknowns.

Sections must not duplicate each other semantically. If a sentence appears in one section, it should not reappear with minor wording changes elsewhere.


## Source and Style Rules

- Use `{{SOURCE_TRANSCRIPT_CONTEXT}}` as the only factual source.
- Use Reddit POS references for tone, pacing, and readability only.
- Do not import facts, numbers, examples, topic claims, or distinctive wording from POS references.
- Ignore sponsorship, paid-promotion, and affiliate transcript segments completely.
- Avoid meta framing like "this video," "this blueprint," or "the transcript."

## Required Sections

Every output must include all six required sections:
- `Summary`
- `Takeaways`
- `Storyline`
- `Deep Dive`
- `Practical Rules`
- `Open Questions`

## Section Contract

### Summary

Summary is the opening context layer and should orient the reader to the topic quickly before detailed reasoning starts. It should explain what the topic is about, why it matters, and what baseline prerequisites or assumptions the reader should keep in mind. Keep it concise, readable, and general enough to help first-pass comprehension. Do not use Summary to dump detailed mechanisms or dense evidence blocks; those belong in `Storyline` and `Deep Dive`.

### Takeaways

Takeaways is the highest-value skim section and should deliver immediate payoff in three to four complete bullets. Each bullet must stand alone and give the reader one meaningful thing they can retain or use right away. This section is not a keyword list and not a teaser. It should read like distilled insight with practical consequence. Depth should be concise but non-trivial: enough specificity to be useful, short enough to scan in seconds. Target total read time is roughly ten to twenty seconds.

### Storyline

Storyline is the narrative core and should read like a coherent mini-essay in two to three content-rich paragraphs/slides. It carries the main through-line: what matters, why it matters, and how to interpret it in practice. This section should feel human, connected, and intentional, not stitched together from note fragments. It should not degrade into bullet artifacts or duplicate sentences from Takeaways. Target depth is enough for a full read to feel satisfying without requiring the original video.

### Deep Dive

Deep Dive explains mechanism and reasoning. It should provide three to five complete bullets that show how or why outcomes happen, under what conditions they hold, and where boundaries appear. Language should stay domain-native and specific to the topic, not generic framework filler. This section should make the reader feel more precise, not simply more verbose.

### Practical Rules

Practical Rules turns understanding into repeatable action. It should provide three to five complete bullets that a reader can apply without guesswork. Rules should be operational, ideally in simple conditional framing when helpful, and should reduce ambiguity rather than introduce it. This section should prioritize real-world decision clarity over motivational language.

### Open Questions

Open Questions defines what remains unresolved in a useful way. It should provide three to five concrete questions that matter for interpretation, implementation, or confidence. Questions should be specific enough to guide future thinking and should avoid generic placeholders like "more research is needed." This section preserves intellectual honesty while keeping momentum.

## Representation Contract (Shape and Completeness)

| Section | Required shape | Depth target | Fail conditions |
|---|---|---|---|
| `Summary` | concise intro context paragraph block | orientation + prerequisites without detail overload |
| `Takeaways` | 3-4 complete bullets, each 1-2 sentences | fast-skim value in ~10-20 seconds | clipped bullets, generic labels, keyword-only lines, overlong bullets |
| `Storyline` | 2-3 coherent content-rich paragraphs/slides | primary narrative payload | random fact stacking, duplicated lines, thin filler slides, list artifacts |
| `Deep Dive` | 3-5 complete bullets, each 1-2 sentences | mechanism/context clarity | generic off-domain bullets, stubs, repeated boilerplate tails, overlong bullets |
| `Practical Rules` | 3-5 complete bullets, each 1-2 sentences | actionable decisions | non-operational advice, abstract slogans, overlong bullets |
| `Open Questions` | 3-5 complete bullets, each 1-2 sentences | meaningful unknowns | generic filler questions, repeated "why it matters" tails, overlong bullets |

## Anti-Slop Rules

Avoid the most common failure patterns:
- no repeated sentences or near-duplicate points across sections
- no clipped bullets or bullet fragments
- no generic boilerplate endings like repeated “why it matters” filler
- no domain drift; use topic-native language

## Strict JSON Contract

Return one complete JSON object only.

- No markdown fences
- No commentary before or after JSON
- No extra braces
- No missing commas
- No malformed arrays or objects
- Do not rename keys
- Do not use alternate keys such as `bleup`
- Do not flatten object fields into strings

Field-shape requirements:
- `summary` must be an object with one key: `text`
- `storyline` must be an object with one key: `text`
- `takeaways`, `deep_dive`, `practical_rules`, and `open_questions` must be objects with one key: `bullets`
- `bullets` values must be arrays of strings

Check that braces, commas, arrays, and objects are complete and balanced before returning.

## Response Format

Title is assigned by backend from `{{VIDEO_TITLE}}`, so do not include a `title` field.

```json
{
  "schema_version": "blueprint_sections_v1",
  "tags": ["string"],
  "summary": {
    "text": "string"
  },
  "takeaways": {
    "bullets": ["string"]
  },
  "storyline": {
    "text": "string"
  },
  "deep_dive": {
    "bullets": ["string"]
  },
  "practical_rules": {
    "bullets": ["string"]
  },
  "open_questions": {
    "bullets": ["string"]
  }
}
```

## Runtime Payload

Video URL: {{VIDEO_URL}}
Video title: {{VIDEO_TITLE}}
Transcript source: {{TRANSCRIPT_SOURCE}}

Oracle POS vibe directory: {{ORACLE_POS_DIR}}

Selected positive reference paths:
{{POSITIVE_REFERENCE_PATHS}}

Injected positive reference excerpts (vibe only, not factual source):
{{POSITIVE_REFERENCE_EXCERPTS}}

Quality issue codes (retry only, else `none`):
{{QUALITY_ISSUE_CODES}}

Quality issue details (retry only, else `none`):
{{QUALITY_ISSUE_DETAILS}}

Additional instructions:
{{ADDITIONAL_INSTRUCTIONS}}

Source transcript context (ONLY factual source of truth):
{{SOURCE_TRANSCRIPT_CONTEXT}}

## Final Directive

Generate now using transcript context as the only factual source. Use POS references only for vibe calibration. Include all required sections in the exact JSON schema above, with the exact field names and field shapes shown above.
