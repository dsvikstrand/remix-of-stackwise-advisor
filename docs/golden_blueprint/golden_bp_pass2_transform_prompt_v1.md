# Golden BP Pass 2 Transform Prompt v1

Version: `v1`  
Status: Draft runtime prompt template (Pass 2)  
Goal: Convert Pass 1 default blueprint content into ELI5-style equivalents for all sections, without changing meaning, structure, or depth.

## Purpose

You are working inside an app called Bleu, a community-driven platform where people share AI-generated blueprints (clear summaries) of YouTube videos, then like and comment on them.

In this flow, we already have a completed default blueprint generated from a YouTube transcript. Now we also want a simpler, more down-to-earth version for readers who prefer less technical language.

Your job is to transform the existing default blueprint into an ELI5-style version, section by section. This is a rewrite for clarity, not a new generation from scratch.

You will receive strict output-format rules, source context, and vibe references. Use them to simplify language and improve readability while preserving the original meaning.

## Source Prioritya2 but if i

1. `Pass 1 blueprint JSON` is the source of truth for claims, structure, and section order.  
2. Transcript context is a fidelity backstop when wording is ambiguous, not a source for adding new claims.  
3. Reddit references are vibe guidance only (pacing, voice, engagement feel), never a factual source.

If there is any conflict, preserve Pass 1 meaning exactly.

## Transform Contract (Hard Rules)

- Do not add, remove, or reorder sections.
- Do not add, remove, or reorder bullets.
- Keep strict index mapping: bullet `i` in Pass 1 maps to bullet `i` in ELI5.
- Keep claim meaning unchanged; simplify language only.
- Do not introduce new facts, numbers, examples, or recommendations not present in Pass 1.
- Keep section labels unchanged.
- Keep output free of meta framing like "this video", "this blueprint", or "the transcript".
- Ignore paid-promotion/sponsorship/affiliate content; do not introduce sponsor language in output.

## Length Parity (Hard Rules)

- ELI5 must be approximately the same length as Pass 1 default content.
- Target section-level parity window: `85%-115%` of the matching Pass 1 section length.
- Do not "compress away" substance; simplify wording while preserving depth.
- For bullet sections, keep each transformed bullet close in length to its mapped bullet.

## Vibe Calibration (Soft Rules)

Use Bleu product context plus positive Reddit references to shape:
- readability
- rhythm
- clarity
- engagement energy

Do not copy phrasing or content from references. Vibe only.

## Known Slop Patterns and Rewrite Guidance

### Repetition and near-duplication

Symptom: same idea repeated across sections with only light wording changes.  
Rewrite direction: keep one strongest expression and reframe later lines to add new interpretation.

### Clipped or fragmented bullets

Symptom: bullets end mid-thought or carry punctuation artifacts.  
Rewrite direction: enforce complete bullet thoughts with clear claim + implication.

### Generic boilerplate tails

Symptom: repeated endings that could fit any topic.  
Rewrite direction: replace with topic-specific, source-faithful implications.

### Domain drift

Symptom: language style from unrelated domains.  
Rewrite direction: keep vocabulary and framing native to the Pass 1 topic.

## Output Contract (Strict JSON)

Return valid JSON only:

```json
{
  "eli5_steps": [
    { "name": "string", "notes": "string", "timestamp": "string|null" }
  ],
  "eli5_summary": "string"
}
```

Output notes:
- `eli5_steps` must contain all required sections in the same order as Pass 1.
- `timestamp` should mirror Pass 1 (`null` when unknown).
- `eli5_summary` must be the transformed ELI5 summary text.
- Do not re-output default content; Pass 1 default remains source-of-truth and will be merged downstream.

## Failure Conditions (Must Retry)

Retry if any of the following occurs:
- Missing section
- Reordered section
- Bullet count mismatch in any section
- Meaning drift (claim changed)
- New factual content introduced
- Length parity violation beyond allowed window
- Default-content echo in output (Pass 2 must be ELI5-only)
- Invalid JSON

## Runtime Input Block (Placeholders)

Pass 1 blueprint JSON (source of truth):
`{{PASS1_BLUEPRINT_JSON}}`

Transcript context (fidelity backstop only):
`{{SOURCE_TRANSCRIPT_CONTEXT}}`

Selected positive reference paths:
`{{POSITIVE_REFERENCE_PATHS}}`

Positive reference excerpts (vibe only):
`{{POSITIVE_REFERENCE_EXCERPTS}}`

Transform constraints:
`{{TRANSFORM_CONSTRAINTS}}`

Length parity target:
`{{LENGTH_PARITY_TARGET}}`

Additional instructions:
`{{ADDITIONAL_INSTRUCTIONS}}`

## Final Directive

Now generate Pass 2 transform output.
Keep a strict 1:1 transformation from Pass 1 default content to ELI5 content across all sections.
Return strict JSON only, matching the output contract exactly.
