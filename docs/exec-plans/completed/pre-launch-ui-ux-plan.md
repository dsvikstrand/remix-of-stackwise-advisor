# Pre-Launch UI/UX Plan

Status: `completed`

## Goal
a1) [have] Tighten the signed-in information architecture and first-session guidance so new users can understand:
- `Home` as the single feed hub
- `Channels` as topic interests
- `Subscriptions` as creator inputs
- `Add` as intentional blueprint generation

## Shipped
b1) [have] Signed-in navigation was updated to:
- `Home`
- `Channels`
- `Subscriptions`
- `Add`

b2) [have] Secondary destinations were demoted out of primary nav:
- `Explore` moved to the user menu
- `Landing` was removed for signed-in users after confirming it redirected back to `Home`

b3) [have] `Home` language was tightened so the three lanes are legible:
- `My Feed` = creators you subscribe to
- `Joined` = channels you follow
- `All` = every public blueprint on Bleup

b4) [have] `Subscriptions` language was tightened around mode behavior:
- `Auto generate`
- `Manual only`
- clearer explanation that subscriptions shape `My Feed`

b5) [have] `Channels` language was tightened so it is clearly about following topics, not creators.

b6) [have] The Help overlay was rewritten to match the current product model and no longer uses stale `For You` / `Tags` language.

b7) [have] Help now also explains the locked-item path and credits more clearly:
- `Manual only` subscriptions can place locked items in `My Feed`
- turning a locked item into a blueprint costs `1` credit

b8) [have] A lightweight post-setup onboarding card was added on `Home`:
- auto-shows after onboarding completion
- is dismissible
- persists dismissal locally per user
- can be reopened from the user menu

## Validation
c1) [have] Frontend typecheck passed across the shipped passes.

c2) [have] The frontend changes were published live, including:
- nav / IA update
- feed and subscription language update
- Help overlay rewrite
- Help credit/locked-item clarification
- Home onboarding card

c3) [have] The resulting product model is now consistent across:
- nav
- `Home`
- `Channels`
- `Subscriptions`
- Help
- onboarding

## Outcome
d1) [have] The main pre-launch interpretability goals for this pass are complete.

d2) [have] Bleup now explains the difference between creators, topics, and the three `Home` streams much more directly for first-time users.

d3) [have] Any further onboarding or UX work should be treated as a new follow-up plan, not a continuation of this one.
