# Golden BP Prompt Contract v2

Version: `v2`
Status: Canonical (current)
Owner intent: Generate high-value blueprints with a stable Bluep quality stamp and a stricter JSON contract.

## Bluep Writing Identity

Bluep blueprints should feel useful, grounded, and worth reading even when the reader never watches the original video. The writing should feel like a strong explainer talking clearly to an interested reader, not like generic AI filler. Prioritize clarity, practical value, and transcript fidelity over polished fluff.

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

Short section behavior:
- `Summary`: brief topic orientation and why it matters
- `Takeaways`: `3-4` complete bullets with immediate value
- `Storyline`: `2-3` coherent narrative paragraphs in flowing prose
- `Deep Dive`: `3-5` complete bullets explaining how or why
- `Practical Rules`: `3-5` complete bullets turning insight into action
- `Open Questions`: `3-5` concrete unresolved questions

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
