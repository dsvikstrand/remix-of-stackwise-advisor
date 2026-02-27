# Golden Blueprint Protocol v0

> Canonical update: for current generation prompt contract and strict section semantics, use `docs/golden_blueprint/golden_bp_prompt_contract_v1.md`.  
> This v0 document is preserved as historical baseline context.

## Purpose

- [have] Define the current baseline protocol for generating new Golden Blueprints in Bluep.
- [have] Capture the manual quality decisions that produced the strongest reference output (for example: `Leucine After 35: Better for Muscle Maintenance Than Muscle Gain`).
- [have] Establish a stable contract for structure, voice, and readability before deeper automation tuning.

## Scope

- [have] This protocol applies to Bluep blueprint content generation quality.
- [have] It is content-format guidance, not a database or API schema spec.
- [todo] Domain-specific adaptation rules will continue to evolve after live testing.

## Core Principle

- [have] Target user outcome: “I got real value fast, and I want to keep reading.”
- [have] Founder-fit test: if browsing feels natural (not forced testing), quality is trending in the right direction.

## Golden BP v0 Content Contract

### 1) Fast Value First

- [have] Start with `Lightning Takeaways` containing 3-4 concrete bullets.
- [have] These bullets must carry value even if read alone in ~10 seconds.
- [have] Avoid generic labels or placeholders as bullets.

### 2) Thumbnail Placement

- [have] Place video thumbnail directly under `Lightning Takeaways`.
- [have] Keep thumbnail visible before long-form sections to preserve source context.

### 3) Summary Style

- [have] Use a single flowing `Summary` section (not fragmented micro-sections).
- [have] Target summary length (deep/research style): ~220-350 words.
- [have] Write in 3-4 natural paragraph chunks that can render well as swipe slides.
- [have] Do not stuff bullet-list artifacts into summary prose.

### 4) Required Follow-Up Sections

- [have] Keep this ordered section set after `Summary`:
  - `Mechanism Deep Dive`
  - `Tradeoffs`
  - `Decision Rules`
  - `Open Questions`
  - `Bottom Line`

### 5) Anti-Clutter Rules

- [have] No `AI Review` block in final blueprint body.
- [have] No legacy “Steps-style” framing language in user-facing copy.
- [have] No `No items assigned` artifacts.
- [have] No subtitle noise that breaks reading flow.

## Voice and Tone Protocol

- [have] Write person-to-person in creator-like tone.
- [have] Avoid meta narrator phrasing such as:
  - “this video explains...”
  - “this blueprint describes...”
  - “the transcript says...”
- [have] Prefer direct, grounded statements with practical implications.
- [have] Keep confidence calibrated; include caveats where uncertainty exists.

## Readability and Depth Targets

- [have] Skim value target: 30-60 seconds (takeaways + first summary lines).
- [have] Full read target: 3-4 minutes.
- [have] Content should feel compact but not shallow.
- [have] Prioritize specificity over decorative language.

## Domain Adaptation Rules

- [have] Keep the same protocol backbone across domains.
- [have] Adapt emphasis by domain:
  - Research/deep dive: mechanism, constraints, decision boundaries.
  - Recipe/practical: playbook steps, substitution rules, failure points.
  - Action/how-to: sequencing, thresholds, “do this now” clarity.
- [have] The medium changes, but clarity/specificity/actionability standards do not.

## Rendering Contract (UI-Aware)

- [have] `Summary` may be split into 3-4 swipe slides when chunk quality is good.
- [have] Non-summary sections should remain readable as standard blocks/lists.
- [todo] Continue tuning chunking heuristics to avoid awkward sentence splits.

## Anti-Slop Heuristics (Bluep-Specific)

- [have] “Slop” in Bluep is often perceived as:
  - repeated/recycled phrasing
  - generic insight that feels interchangeable
  - content that is useful but uninspiring to read
- [have] A blueprint can be factual yet still fail quality if it feels template-generated.
- [have] Novel framing + specific implications are required for perceived value.

## External Signal Inputs: Reddit Pos/Neg

### Positioning

- [have] Reddit examples are a signal source, not a formatting template.
- [have] Bluep is not an open-post forum; it is a source-grounded blueprint product.
- [have] Bluep is explicitly AI-assisted, so trust comes from usefulness and honesty, not authorship ambiguity.

### What We Reuse from Reddit Signals

- [have] Fast payoff in the opening.
- [have] Claim -> evidence -> implication loops.
- [have] Practical transfer value (“what can I do now?”).
- [have] Grounded voice with tradeoffs and limits.
- [have] Strong skimmability.

### What We Do Not Reuse

- [have] Reddit-native feedback-bait openings.
- [have] OP/social-positioning as a content scaffold.
- [have] Engagement-first phrasing that weakens content density.

### Translation Rules (Reddit Signal -> Blueprint Behavior)

- [have] “Immediate payoff” -> strong `Lightning Takeaways`.
- [have] “Evidence-backed claim” -> concrete anchors inside `Summary` and `Mechanism`.
- [have] “Actionable close” -> explicit `Decision Rules` + `Bottom Line`.
- [have] “Low novelty risk” -> avoid generic opener templates and repeated wording.

### Guardrail Against Overfitting to Reddit

- [have] If a change improves “Reddit vibe” but reduces source fidelity or blueprint clarity, reject it.
- [have] Final arbiter is in-app natural reading behavior, not stylistic similarity to Reddit posts.

## Acceptance Checklist (v0)

- [have] `Lightning Takeaways` exists with 3-4 specific bullets.
- [have] Thumbnail appears under takeaways.
- [have] `Summary` is flowing prose, 3-4 paragraph chunks, no bullet artifacts.
- [have] Required follow-up sections exist in order.
- [have] Voice is direct and creator-like, not meta-explainer.
- [have] No legacy clutter blocks (`AI Review`, `No items assigned`, step-noise artifacts).
- [have] Reader can capture key value quickly and still gain depth in full read.
- [todo] Add automated quality gates that enforce these checks pre-save.

## Known Gaps (Current Runtime vs Protocol)

- [todo] Some generated outputs still leak placeholder takeaways.
- [todo] Some summaries still include dashed bullet fragments inside prose.
- [todo] Voice occasionally drifts to generic “guide/explainer” tone.
- [todo] Normalization needs stronger semantic cleanup, not just section-shape enforcement.

## Immediate Next Iteration Targets

- [todo] Enforce takeaway quality filter (reject/repair label-like bullets).
- [todo] Enforce summary de-bulleting and flow cleanup.
- [todo] Add creator-tone rewrite pass with hard banned meta phrasing.
- [todo] Add pre-publish quality checks tied to this protocol checklist.

## Versioning

- [have] Version: `v0` (manual baseline lock).
- [todo] Promote to `v1` after live test cycle confirms natural-browsing quality on mixed domains.
