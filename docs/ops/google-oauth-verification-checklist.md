# Google OAuth Verification Checklist

Status: `active`  
Scope: internal/beta Google OAuth readiness while the public MVP path stays manual-creator-add first.

## Purpose
a1) [have] Bleu still has a real YouTube connect/import flow in code for internal or beta use.
a2) [have] The public MVP path no longer depends on self-serve Google OAuth.
a3) [have] Public users are expected to:
- add creators manually
- optionally use a future public-subscriptions import flow
a4) [todo] The remaining readiness work is therefore for a narrower use case:
- keep the internal/beta OAuth story accurate
- keep the legal/privacy explanation accurate
- keep the option open for a future reviewed launch without misrepresenting the current MVP

## Current Scope Assumption
b1) [have] The repo default scope is `https://www.googleapis.com/auth/youtube.readonly`.
b2) [have] Code reference:
- `server/index.ts` resolves `YOUTUBE_OAUTH_SCOPES` and defaults to `https://www.googleapis.com/auth/youtube.readonly`
- `server/services/youtubeOAuth.ts` builds the Google OAuth URL from that scope list
- `server/services/youtubeUserSubscriptions.ts` uses the resulting access token only for `youtube/v3/subscriptions?mine=true`
- `server/services/youtubeOAuth.ts` also uses the token to read the connected user channel profile via `youtube/v3/channels?mine=true`
b3) [have] Current in-repo justification:
- read the creators a user already follows
- import those creator subscriptions into Bleu
- personalize creator-follow/feed setup
- show the connected YouTube channel identity in the app
b4) [have] This scope is no longer part of the public MVP onboarding story.
b5) [todo] Keep requested scopes minimal and consistent with the internal/beta story presented to Google reviewers.
b6) [todo] Confirm in Google Cloud Console that the consent screen/app is not requesting any broader scope than `youtube.readonly`.

## Phase 1 Scope Inventory
c1) [have] Scope inventory table:
- `https://www.googleapis.com/auth/youtube.readonly`
  - runtime purpose: read the authenticated user's YouTube subscriptions and connected channel profile
  - code references: `server/index.ts`, `server/services/youtubeOAuth.ts`, `server/services/youtubeUserSubscriptions.ts`, `server/handlers/youtubeHandlers.ts`
  - user-facing justification: connect YouTube to import the creators you already follow and speed up feed setup
  - necessity read: appears necessary for the current import flow; no broader write scope is justified by the product

c2) [have] Repo audit result:
- no broader YouTube OAuth scope is referenced as the default in runtime code
- the implemented product story is compatible with a read-only YouTube scope
- the remaining internal/beta connect/import flow matches that scope use

c3) [todo] Manual confirmation still needed:
- verify the exact scope list shown in Google Cloud Console matches the repo default and does not include broader scopes accidentally added in the console

## Public Surface Checklist
d1) [have] Homepage / landing now explains manual creator add and public-subscriptions import as the public MVP story.
d2) [have] Privacy policy explicitly covers Google/YouTube OAuth usage.
d3) [have] Terms of service describe connected third-party services concretely.
d4) [todo] Public copy should not imply self-serve Google/YouTube account connection is the normal MVP path.
d5) [todo] Privacy policy and terms should continue to describe OAuth accurately as an optional internal/beta or future-reviewed capability rather than a required public feature.

## Privacy Policy Must Answer
e1) [have] What account and product data Bleu stores.
e2) [have] That users may connect Google/YouTube to import the creators they already follow.
e3) [have] That Bleu uses this to import creator subscriptions and personalize feed setup.
e4) [have] That Bleu does not post to YouTube or modify the user account.
e5) [have] That users can disconnect access.
e6) [todo] Confirm the wording about what imported rows remain in-app after disconnect matches runtime behavior exactly.
e7) [todo] Confirm deletion-request instructions are operationally correct.

## In-App Reviewer Walkthrough
f1) [have] The concrete recording flow now lives in `docs/ops/google-oauth-reviewer-demo-script.md`.
f2) [have] The minimal operator checklist now lives in `docs/ops/google-oauth-reviewer-recording-quickcheck.md`.
f3) [todo] If/when internal or future public verification proceeds, record the reviewer video using that script and keep the flow literal:
- homepage explainer
- privacy policy YouTube section
- sign in
- `/subscriptions`
- `Connect YouTube`
- connected state
- import preview/result
- disconnect
f4) [todo] Keep the walkthrough short and explicit, and make sure it is not confused with the public MVP path.

## Reviewer Questions To Be Able To Answer
g1) [todo] Why does Bleu need YouTube access?
Answer target:
- to import the creators a user already follows and personalize feed setup

g2) [todo] What data does Bleu access?
Answer target:
- YouTube subscription/account data needed for the import feature

g3) [todo] What does Bleu do with that data?
Answer target:
- creates Bleu-side creator subscriptions and improves initial feed personalization

g4) [todo] Can the user disconnect access?
Answer target:
- yes, from within the app

g5) [todo] What happens after disconnect?
Answer target:
- OAuth access is removed; previously imported Bleu-side subscription rows may remain until the user removes them

## Remaining Readiness Steps
h1) [todo] Confirm the exact Google/YouTube scopes configured in Google Cloud and document them here.
h2) [have] Reviewer/demo script is captured in `docs/ops/google-oauth-reviewer-demo-script.md`.
h3) [todo] Decide whether the internal/beta OAuth flow will remain closed-beta only or be submitted for broader review later.
h4) [todo] If broader review is still planned, record the reviewer video and attach the final location here.
h5) [todo] Verify the homepage, privacy, and in-app copy remain in sync after future landing/onboarding/subscriptions edits.

## Evidence
i1) [have] Privacy policy hardened in `src/pages/Privacy.tsx`.
i2) [have] Terms of service hardened in `src/pages/Terms.tsx`.
i3) [have] Landing page now presents manual creator add as the public path and public-subscriptions import as the optional import story in `src/components/home/landing-v2/LandingProofSections.tsx`.
i4) [have] Repo scope inventory completed: default runtime scope is `https://www.googleapis.com/auth/youtube.readonly`.
i5) [have] Reviewer demo script added in `docs/ops/google-oauth-reviewer-demo-script.md`.
i6) [have] Minimal recording quickcheck added in `docs/ops/google-oauth-reviewer-recording-quickcheck.md`.
i7) [have] `/subscriptions` is now manual-creator-add first in the public MVP path and no longer surfaces direct YouTube OAuth as the main UX.
i8) [todo] Add Google submission date, reviewer video link, and approval/rejection notes if/when submission starts again.
