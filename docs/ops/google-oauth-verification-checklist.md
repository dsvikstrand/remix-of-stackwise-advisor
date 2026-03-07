# Google OAuth Verification Checklist

Status: `active`  
Scope: public/legal/copy readiness for moving Google OAuth from testing-mode test users toward broader public use.

## Purpose
a1) [have] Bleu already has a real YouTube connect/import flow.
a2) [todo] The remaining readiness work is mostly public-facing clarity:
- explain why Google/YouTube access is needed
- explain what data is accessed
- explain how users disconnect and what happens to imported data
- make homepage, privacy policy, and in-app copy tell the same story

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
b4) [todo] Keep requested scopes minimal and consistent with this story presented to Google reviewers.
b5) [todo] Confirm in Google Cloud Console that the consent screen/app is not requesting any broader scope than `youtube.readonly`.

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
- the connect/import flow in `/subscriptions` matches that scope use

c3) [todo] Manual confirmation still needed:
- verify the exact scope list shown in Google Cloud Console matches the repo default and does not include broader scopes accidentally added in the console

## Public Surface Checklist
d1) [have] Homepage / landing explains the YouTube connection in product language.
d2) [have] Privacy policy explicitly covers Google/YouTube OAuth usage.
d3) [have] Terms of service describe connected third-party services concretely.
d4) [todo] Public homepage copy, privacy policy, and in-app connect flow should all tell the same scope-justification story.

## Privacy Policy Must Answer
e1) [have] What account and product data Bleu stores.
e2) [have] That users may connect Google/YouTube to import the creators they already follow.
e3) [have] That Bleu uses this to import creator subscriptions and personalize feed setup.
e4) [have] That Bleu does not post to YouTube or modify the user account.
e5) [have] That users can disconnect access.
e6) [todo] Confirm the wording about what imported rows remain in-app after disconnect matches runtime behavior exactly.
e7) [todo] Confirm deletion-request instructions are operationally correct.

## In-App Reviewer Walkthrough
f1) [todo] Record a short reviewer video that shows:
- landing page explains YouTube import purpose
- user signs in
- user opens `/subscriptions`
- user clicks `Connect YouTube`
- user sees import flow / connected state
- user understands the imported data is used for creator-follow/feed setup

f2) [todo] Keep the walkthrough short and explicit.

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
h2) [todo] Capture one clean reviewer/demo script with timestamps.
h3) [todo] Verify the homepage, privacy, and in-app copy remain in sync after future landing/onboarding edits.

## Evidence
i1) [have] Privacy policy hardened in `src/pages/Privacy.tsx`.
i2) [have] Terms of service hardened in `src/pages/Terms.tsx`.
i3) [have] Landing page now includes a YouTube import explainer in `src/components/home/landing-v2/LandingProofSections.tsx`.
i4) [have] Repo scope inventory completed: default runtime scope is `https://www.googleapis.com/auth/youtube.readonly`.
i5) [todo] Add Google submission date, reviewer video link, and approval/rejection notes once the submission starts.
