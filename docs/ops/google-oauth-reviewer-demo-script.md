# Google OAuth Reviewer Demo Script

Status: `active`  
Purpose: short internal script for the Google OAuth verification video and reviewer walkthrough.

## Recording Goal
a1) [have] Show that Bleu requests read-only YouTube access for a real user-facing feature.
a2) [have] Prove the scope is used to import creators the user already follows and to speed up feed personalization.
a3) [have] Keep the recording short, literal, and product-focused.

## Scope Story
b1) [have] Requested scope:
- `https://www.googleapis.com/auth/youtube.readonly`

b2) [have] Reviewer-safe justification:
- Bleu uses read-only YouTube access to read the creators a user already follows and import them into Bleu.
- Bleu uses the imported creator list to personalize creator-follow setup and the user's feed.
- Bleu does not post to YouTube or modify the user's YouTube account.

## Preflight
c1) [todo] Verify these pages are live before recording:
- `https://bleup.app/`
- `https://bleup.app/privacy`
- `https://bleup.app/terms`
- `https://bleup.app/subscriptions`

c2) [todo] Verify the production OAuth callback is current in Google Cloud:
- `https://api.bleup.app/api/youtube/connection/callback`

c3) [todo] Use a test Google account with at least a few YouTube subscriptions so the import result is visible.

c4) [todo] Make sure the app account used for recording can sign in successfully before the video starts.

## Recording Flow
d1) [todo] Start on the public homepage:
- open `https://bleup.app/`
- show the landing explainer block about optional YouTube import
- say: `Bleu lets users optionally connect YouTube to import the creators they already follow and personalize their feed setup.`

d2) [todo] Open the privacy policy:
- open `https://bleup.app/privacy`
- scroll to the Google/YouTube connection section
- say: `The privacy policy explains what YouTube data is read, what it is used for, and that the connection is read-only.`

d3) [todo] Open the subscriptions page:
- navigate to `https://bleup.app/subscriptions`
- show the `Connect YouTube` button
- say: `Users connect YouTube from the subscriptions page to import creators in bulk.`

d4) [todo] Start the connect flow:
- click `Connect YouTube`
- let the Google consent screen appear
- pause long enough for the reviewer to see the app name and requested permission
- say: `Bleu requests read-only YouTube access so it can import the creators the user already follows.`

d5) [todo] Complete the OAuth flow:
- approve with the test account
- return to Bleu
- show the connected YouTube account state

d6) [todo] Show the import feature:
- click `Import from YouTube`
- show the imported creator list or preview state
- say: `Bleu uses the read-only YouTube data to import the creators the user already follows into the app.`

d7) [todo] Show the product outcome:
- point to the creator/subscription state in the app
- if available, show that the imported creators affect feed setup or creator-follow state
- say: `This imported creator data is used to personalize the user's setup and feed.`

d8) [todo] Show disconnect:
- click `Disconnect`
- show the disconnect action in the UI
- say: `Users can disconnect YouTube access at any time from the app.`

## Talking Points
e1) [have] Keep the narration simple:
- what the permission is
- why Bleu needs it
- where the user triggers it
- what Bleu does with the returned data

e2) [todo] Avoid marketing language like:
- `AI magic`
- `transform your workflow`
- `unlock productivity`

e3) [todo] Prefer concrete language:
- `import creators`
- `personalize feed setup`
- `read-only access`
- `disconnect any time`

## Evidence To Save
f1) [todo] Save:
- final video file
- video URL/location
- date recorded
- Google account used for recording

f2) [todo] Record quick notes after the video:
- did the consent screen show the expected scope story clearly
- did import results show enough creator rows to be convincing
- did disconnect work cleanly

## Completion
g1) [todo] After recording, update:
- `docs/ops/google-oauth-verification-checklist.md`

g2) [todo] Add:
- recording date
- video location
- reviewer-package status
