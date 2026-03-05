# Reddit Pos/Neg Insights for Golden Blueprint (Bluep)

## Scope

- Reddit examples are used as a **signal source** for engagement mechanics.
- Reddit examples are **not** direct templates for Bluep output format.
- Bluep is video-synthesis content (AI-generated, openly), so the goal is to import what drives reader value, not copy Reddit post style.

## Data Reviewed

- Positive set: `reddit/clean/pos`
- Negative set: `reddit/clean/neg`

## Method (Lightweight)

- Compared POS vs NEG for recurring patterns in:
  - opening strategy
  - structure and flow
  - evidence density
  - transfer/action clarity
  - voice and trust signals
- Combined quick quantitative checks (length/markers) with qualitative reading.

## Caveats

- `clean/pos` includes at least two outliers for pattern mining:
  - `A month off THC  rBiohackers.md` (placeholder; OP body unavailable)
  - `Google Research Presents Titans.md` (scrape artifact residue)
- `clean/neg` should be treated mainly as **low-impact** examples, not guaranteed “AI slop.”

## POS Patterns (Why They Tend to Engage)

1. Payoff-first opening
- Strong POS posts quickly answer: “What happened?” and “Why should I care?”
- Outcome/stakes appear early, reducing reader uncertainty.

2. Claim -> evidence -> implication loops
- High-engagement posts frequently package points as:
  - claim
  - concrete evidence (numbers/tests/examples)
  - practical implication
- This creates trust and keeps momentum.

3. Transferable value
- Strong POS content gives reusable thinking:
  - what worked vs failed
  - decision rules
  - process breakdowns
- Reader leaves with something they can apply immediately.

4. Operator voice (earned authority)
- Many POS posts include constraints/mistakes/tradeoffs.
- This voice feels grounded and reduces “generic polished AI tone.”

5. Structured readability
- Better posts often use explicit sections and clean progression.
- Readers can skim and still capture core value.

## NEG Patterns (Why They Tend to Underperform)

1. Request-first framing
- Many NEG posts start by asking for feedback/takes before delivering value.
- This can feel like asking audience effort first.

2. Lower payoff clarity
- The “why now” or “what changed” signal is weaker in the opening.
- Reader has to work harder to find the value.

3. Generic usefulness without sharp novelty
- Advice can be broadly true, but not memorable/new enough.
- Result: low save/share energy.

4. Flatter structure
- Less staged flow and weaker sectioning reduce comprehension speed.
- Reader drop-off risk rises when narrative direction is unclear.

5. Numbers without insight
- Some NEG examples contain metrics, but still underperform.
- Metrics alone do not carry value without interpretation and implication.

## What Bluep Should Borrow (and What It Should Not)

### Borrow

- Fast payoff in first lines
- Evidence-backed statements
- Transferable insight (decision/action)
- Honest caveats and tradeoffs
- Clear section flow for skim + full read

### Do Not Borrow

- Reddit conversational overhead (feedback-seeking openings)
- Community-specific phrasing as structural default
- OP-centric social framing as core format

## Bluep Translation Rules (Video-Native)

1. Value unit rule
- Every section must provide at least one value unit:
  - result
  - mechanism
  - decision rule
  - action
  - constraint/caveat

2. Opening rule
- First 2-4 lines must state:
  - core thesis of the video
  - why it matters now

3. Specificity rule
- Include concrete anchors from the source:
  - numbers, thresholds, sequence logic, examples
- Avoid “overview-only” language.

4. Transfer rule
- Reader should leave with 1-3 things they can do/decide now.

5. Anti-slop rule
- Avoid recycled generic prose patterns.
- Avoid sounding like a content-template filled with new nouns.

## Do / Don’t Checklist for Golden BP Drafts

Do
- Deliver value before asking for engagement.
- Use claim->evidence->implication pattern repeatedly.
- Preserve nuance (when advice fails, tradeoffs, context).
- Optimize for 30-60s skim + 3-4 min full read.

Don’t
- Start with soft framing without payoff.
- Rely on high-level summaries with no concrete payload.
- Use metrics as decoration without interpretation.
- Let tone become interchangeable with generic AI explainers.

## Practical Next Step

- Use these insights to define 2-3 Bluep-native template candidates.
- Run a small batch against mixed transcript domains.
- Score each draft on:
  - clarity
  - specificity
  - novelty feel
  - actionability
  - trust/groundedness
- Keep only templates that trigger natural reading behavior (founder-fit test).
