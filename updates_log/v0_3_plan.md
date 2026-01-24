# v0_3 Plan (Social Refinement + Creator Tools)

Date: 2026-01-24
Status: Draft plan for implementation

---

## 1) Goals (Product Outcomes)

- g1) Make the app feel frictionless for first-time users: minimal steps, clear actions, instant feedback.
- g2) Strengthen the social loop: create -> tag -> share -> discover -> engage -> save.
- g3) Improve creator experience: easier save/share, clearer visibility, better tagging.
- g4) Keep scope focused on MVP smoothness (no heavy new systems).

---

## 2) Scope

### In Scope
- s1) Reduce friction across Share, Tags, Wall feeds, and Comments.
- s2) Add lightweight search and discovery where it removes friction.
- s3) Improve page navigation and clarity for core tasks.
- s4) Polish micro-UX (empty states, confirm states, spacing, consistent actions).

### Out of Scope (Defer)
- s5) Analytics / admin / roles.
- s6) Editing tags on existing recipes.
- s7) Full post detail pages as a must-have (optional/secondary).
- s8) Notifications system.

---

## 3) Feature Epics

### Epic A: Frictionless Sharing & Tagging (Creator Tools)
- a1) Make Save -> Share flow feel 1-step with clear defaults (visibility + tags).
- a2) Reuse recent tags (quick pick) to minimize typing.
- a3) Inline tag suggestions in Share and Tag Directory with best matches.
- a4) Ensure visibility status is visible in My Recipes + on Wall share confirmation.

### Epic B: Feed Smoothness (Wall)
- b1) Wall tabs stay fast (For You, Latest, Trending, Saved).
- b2) Add a simple “Load more” pattern if needed (pagination or infinite scroll).
- b3) Improve empty states with clear next actions (follow tags, share, create).

### Epic C: Comment Experience
- c1) Keep threaded comments readable with pagination per thread.
- c2) Add small UI affordances: edited note, reply focus, cancel actions.
- c3) Optional: add “Top / Latest” toggle for comments (secondary).

### Epic D: Tag Discovery
- d1) Tag Directory should feel like “subreddits”: follower count, follow/mute state.
- d2) Add tag search + quick-follow actions.
- d3) Add tags in AppNavigation (already done) + keep in Wall header.

### Epic E: Optional (Search)
- e1) Add light search for tags and recipes in Wall feed (secondary).
- e2) Keep it minimal: filter current list rather than global search index.

---

## 4) UX / UI Plan

- u1) Make “Share to Wall” feel like a single action with optional caption.
- u2) Show tag count and visibility state in My Recipes list cards.
- u3) Add consistent button placement across Blend/Protein/Wall for “Save / Share”.
- u4) Use visual confirmation states (toast + in-card label) on share/save.
- u5) Keep Y2K aesthetic, avoid introducing new themes during v0_3.

---

## 5) Technical Plan (High-level)

### Data Layer
- t1) No new tables required for MVP smoothness.
- t2) Optional: add lightweight views or indexes if performance needs emerge.

### Frontend & Hooks
- t3) Add shared utilities for tag suggestions and recent tags.
- t4) Add small feed utilities: pagination helper or “load more” state.
- t5) Add UI micro-components for info badges (visibility, tag count).

---

## 6) Risks & Mitigations

- r1) Query complexity on Wall feed (tags + follows + likes) -> add caching and limit sizes.
- r2) Comment thread size grows -> keep per-thread pagination default.
- r3) Share flow confusion -> enforce minimal required steps with clear copy.

---

## 7) Success Metrics (Qualitative / MVP)

- m1) New user can create + share a recipe in < 60 seconds without confusion.
- m2) Wall feed loads in < 2 seconds for default tab.
- m3) Tag following is discoverable in < 1 minute of use.

---

## 8) Test Plan

- t6) Manual smoke tests for:
  - t6a) Share flow (tag required, visibility states)
  - t6b) Wall tabs (For You / Latest / Trending / Saved)
  - t6c) Comment replies + pagination
  - t6d) Tag Directory follow/mute

---

## 9) Dependencies

- d4) Supabase migrations already applied via Lovable.
- d5) Supabase types auto-regeneration pending sync to repo.

---

## 10) Open Questions for v0_3 (Follow-ups)

- q1) Do you want “recent tags” to show globally or per user only?
- q2) Should the share flow force a caption or keep it optional?
- q3) Do you want the Wall feed to show tag chips that are clickable into Tag Directory?
- q4) Should there be a minimal post detail page later (nice-to-have) or keep inline?
- q5) Should “Saved” tab appear for logged-out users with a sign-in CTA?

---

## 11) Proposed Build Order

- p1) Share flow polish + recent tag suggestions
- p2) Wall feed polish (empty states, load more)
- p3) Comment UX polish
- p4) Tag Directory polish
- p5) Optional lightweight search

---

## 12) Summary

v0_3 focuses on social refinement and creator tools to make the MVP feel smooth and fast. No heavy new systems; just reduce friction and improve discoverability.