# Add "Select channels to join" step to onboarding

## Summary

Add a new optional **Step 3** card to the Welcome Onboarding page (`/welcome`) that lets users browse and join curated channels before completing or skipping onboarding. This uses the existing `useTagFollows` hook and `CHANNELS_CATALOG` data -- no new backend calls, no schema changes.

r3) [todo] Add one hard guard line to avoid accidental scope creep:  
If existing hooks/APIs are insufficient, STOP and report gaps; do not add migrations/endpoints/types changes.

r4) [todo] Add one behavior lock so onboarding logic stays intact:  
Do not change onboarding completion criteria, redirect rules, or skip behavior.

r5) [todo] Add one UX safety rule for missing tag IDs:  
If a catalog slug cannot resolve to a tag row, disable its Join button and show “Unavailable” instead of attempting join.

## What the user sees

1. After Step 2 (Import subscriptions), a new card appears: **"Step 3: Join channels (optional)"**
2. The card shows a list of curated channels from `CHANNELS_CATALOG` (those with `isJoinEnabled: true`), each with icon, name, description, and a Join/Joined toggle button.
3. Users can join or leave any channel inline -- changes persist immediately via the existing `tag_follows` table.
4. The step is entirely optional -- the existing "Skip for now" button and the import-complete flow remain unchanged.
5. If the user has already joined channels (e.g. from a previous visit), those appear as "Joined" by default.

## Files changed

**1 file modified:**

- `src/pages/WelcomeOnboarding.tsx`
  - Import `useTagFollows`, `useTagsBySlugs`, `CHANNELS_CATALOG`, `getChannelIcon` (all existing)
  - Add a new `<Card>` section between the Step 2 card and the skip card
  - Render curated channels with join/leave toggle using `useTagFollows().joinChannel` / `leaveChannel` / `getFollowState`
  - Use `useTagsBySlugs` to resolve tag IDs from catalog slugs (same pattern as `Channels.tsx`)

No new files. No deleted files. No schema changes. No env changes.

## Technical details

- The channel list will be derived from `CHANNELS_CATALOG.filter(c => c.isJoinEnabled && c.status === 'active')`, sorted by `priority`.
- Tag IDs are resolved via `useTagsBySlugs(catalogTagSlugs)` -- same query already used on the Channels page.
- Join/leave actions use `useTagFollows().joinChannel({ id: tagId, slug: tagSlug })` and `leaveChannel(...)` -- writes to existing `tag_follows` table with existing RLS policies.
- The join button shows loading spinners via `getFollowState()` (joining/leaving states), matching the Channels page pattern.
- No changes to the onboarding completion flow -- Step 3 is purely additive UI between Step 2 and the skip card.

## Known limitations

- If `tags` table does not yet contain rows for some catalog tag slugs, those channels will show as "Join" but the join will fail gracefully (tag not found). This is the same behavior as the existing Channels page.
- No telemetry events added for channel joins during onboarding (can be added in a follow-up).
- Channel follower counts are not displayed in this step (keeps the UI simple for onboarding).

## Rollback

Single commit, revertible with:

```
git revert <commit_sha>
```