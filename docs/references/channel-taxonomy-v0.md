# Channel Taxonomy v0

Status: `active`  
Owner: `admin-owner`  
Scope: docs-only specification (no runtime migration in Step 3)

## 1) Purpose and Boundary

This document defines the curated v0 `Channels` layer used by product UX while runtime remains tag-first.

- Channels are a controlled, followable discovery surface.
- Tags remain the internal source of truth in MVP runtime.
- This document is a planning and governance contract only.

Not implemented in Step 3:
- new channel tables/APIs
- runtime auto-mapping
- user-owned channel moderation

## 2) Curated Channel Seed List (20)

| slug | display_name | intent_one_liner | example_blueprint_types | include_tags_examples | exclude_tags_examples | owner_notes |
|---|---|---|---|---|---|---|
| fitness-training | Fitness Training | Structured exercise plans for strength, cardio, and conditioning. | Workout plans, weekly splits | strength-training, hypertrophy, cardio, mobility | skincare, budgeting | Broad fitness lane, high volume expected |
| nutrition-meal-planning | Nutrition and Meal Planning | Practical meal systems for health and consistency. | Meal prep, macro routines | nutrition, meal-prep, protein, healthy-diet | meditation, coding | Keep practical, non-clinical |
| sleep-recovery | Sleep and Recovery | Protocols that improve sleep quality and recovery habits. | Sleep hygiene, wind-down plans | sleep, circadian, recovery, evening-routine | crypto, productivity-hacks | Avoid medical treatment claims |
| mindfulness-mental-wellness | Mindfulness and Mental Wellness | Mental reset and stress management routines. | Breathing, journaling, focus reset | mindfulness, stress-management, mental-wellness | bodybuilding, finance | Keep non-diagnostic framing |
| skincare-personal-care | Skincare and Personal Care | Repeatable self-care routines for skin and grooming. | AM/PM skincare, grooming | skincare, hydration, self-care, grooming | lifting, investing | High beginner relevance |
| cooking-home-kitchen | Cooking and Home Kitchen | Repeatable kitchen workflows and recipe systems. | Recipe workflows, prep systems | cooking, recipe, kitchen, meal-assembly | studying, ai-tools | Separate from nutrition coaching |
| biohacking-supplements | Biohacking and Supplements | Habit-oriented protocols around supplements and optimization. | Supplement stacks, timing guides | biohacking, nootropics, longevity, supplements | legal, business | Flag risky claims for review |
| productivity-systems | Productivity Systems | Planning and execution workflows for getting work done. | Weekly planning, task systems | productivity, planning, routine, focus | investing, skincare | Keep outcome-oriented |
| study-learning-systems | Study and Learning Systems | Methods for learning, revision, and retention. | Study routines, exam prep | studying, spaced-repetition, note-taking, memory | cooking, workout | Student and self-learning lane |
| writing-content-creation | Writing and Content Creation | Systems for drafting, publishing, and content cadence. | Content pipelines, writing sprints | writing, content-creation, publishing, copywriting | skincare, nutrition | Creator-friendly lane |
| creator-growth-marketing | Creator Growth and Marketing | Audience growth and distribution playbooks. | Social content strategy, growth loops | social-media, seo, audience-growth, marketing | meditation, sleep | Keep ethical acquisition guidance |
| business-ops-freelance | Business Ops and Freelance | Lightweight operating systems for solo operators. | Client ops, proposal workflows | freelance, consulting, operations, pricing | gym, skincare | Practical execution over theory |
| career-job-search | Career and Job Search | Structured workflows for finding and landing roles. | Resume systems, interview prep | job-search, resume, interview, networking | nootropics, cooking | Broad utility lane |
| personal-finance-budgeting | Personal Finance and Budgeting | Everyday money management routines and templates. | Budget plans, expense reviews | budgeting, savings, debt-payoff, personal-finance | hypertrophy, meditation | No investment-specific advice |
| investing-basics | Investing Basics | Intro-level investing routines and frameworks. | Long-term investing checklists | investing, index-funds, portfolio-basics | supplements, therapy | Educational, not personalized advice |
| home-organization-cleaning | Home Organization and Cleaning | Systems for maintaining spaces with low friction. | Cleaning rotations, declutter plans | organization, declutter, home-maintenance, cleaning | coding, crypto | Good cold-start utility |
| parenting-family-routines | Parenting and Family Routines | Family-oriented routines for daily coordination. | Morning schedules, school prep | parenting, family-routine, kids-activities | crypto-trading, seo | Keep supportive and practical |
| travel-planning | Travel Planning | Repeatable travel prep and trip-execution workflows. | Packing systems, itinerary planning | travel, itinerary, packing, trip-prep | budget-templates (finance-only), skincare | Avoid legal/visa specifics |
| developer-workflows | Developer Workflows | Coding productivity and engineering workflow routines. | Coding setup, review workflows | coding, developer-tools, git, testing | cooking, skincare | High overlap with productivity |
| ai-tools-automation | AI Tools and Automation | Practical usage patterns for AI tools and automations. | Prompt workflows, automation stacks | ai-tools, automation, llm, prompts | childcare, skincare | Keep focused on practical use cases |

## 3) Mapping Rules (v0 Conservative)

### 3.1 Rule Order
1. Exact tag match to curated include list.
2. Approved synonym match.
3. Weighted keyword match (lowest priority).

### 3.2 Confidence Policy
- Conservative by default.
- If confidence is below threshold or conflicting, do not force channel assignment.
- Ambiguous cases go to `needs-review` queue.

### 3.3 Tie-Break Policy
- Higher confidence score wins.
- If tied, keep item `unlabeled` and send to `needs-review`.

## 4) Fallback Model

- User-facing label: `Other`
- Internal state: `unlabeled`
- Review queue bucket: `needs-review`

Interpretation:
- `Other` should be shown only when user-facing grouping is required.
- `unlabeled` is operational state used for deferred mapping.

## 5) Governance (MVP)

Owner model: `admin-owner` only.

Workflow:
1. LLM suggests channel mapping + rationale.
2. Admin-owner reviews suggestion.
3. Admin-owner approves/rejects.
4. Approved updates are committed to this taxonomy spec.

MVP constraints:
- No auto-approval.
- No community/user-owner governance.

## 6) LLM Review Placeholders (Future)

The following fields are placeholders for deeper eval integration later:

- `suggested_channel`
- `confidence`
- `reasoning_snippet`
- `policy_flags`

Planned future hooks (not active in MVP):
- consistency checks across similar tags
- drift detection over time
- overlap score thresholding

## 7) JSON Handoff Example (Future Runtime Seeding)

```json
{
  "version": "channel_taxonomy_v0",
  "channels": [
    {
      "slug": "fitness-training",
      "display_name": "Fitness Training",
      "intent_one_liner": "Structured exercise plans for strength, cardio, and conditioning.",
      "status": "active",
      "visibility": "public"
    }
  ],
  "synonyms": [
    {
      "tag": "workout",
      "normalized": "fitness-training",
      "confidence": 0.9
    }
  ],
  "keyword_rules": [
    {
      "channel": "productivity-systems",
      "keywords": ["planning", "focus", "task"],
      "weight": 0.35
    }
  ],
  "fallback_policy": {
    "user_facing_bucket": "Other",
    "internal_state": "unlabeled",
    "review_bucket": "needs-review"
  },
  "governance": {
    "owner": "admin-owner",
    "llm_mode": "advisory_only",
    "auto_approve": false
  }
}
```

## 8) Proposed Interfaces (Docs-Only, Not Implemented in Step 3)

- `GET /api/channels`
- `POST /api/channels/map-tags`
- `channel_taxonomy_v0` seed import contract

These interfaces are proposal-level only in Step 3.
