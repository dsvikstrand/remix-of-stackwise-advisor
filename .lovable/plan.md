
# Modern Profile Page and User Following Implementation

## Overview

This plan transforms the current settings-only `/profile` page into a modern, social profile experience with user-to-user following. Based on your preferences:

- **Profiles are private by default** (users must opt-in to make public)
- **Tabs show**: Blueprints, Inventories, Liked, and Activity (3-4 recent items each)
- **Follow button lives on profile page only** (no Following feed on Wall for now)
- **Avatar upload supports both URL and file upload**

---

## New Routes

| Route | Component | Access | Description |
|-------|-----------|--------|-------------|
| `/u/:userId` | `UserProfile.tsx` | Public (if profile is public) | View any user's public profile |
| `/settings` | `Settings.tsx` | Auth required | Edit profile, account, privacy |
| `/profile` | Redirect | Auth required | Redirects to `/u/{currentUserId}` |

---

## Database Changes

### 1. Update `profiles` Table

Add new columns:
- `is_public` (boolean, default FALSE) - Privacy toggle
- `follower_count` (integer, default 0) - Denormalized count
- `following_count` (integer, default 0) - Denormalized count

### 2. New Table: `user_follows`

```text
+---------------+--------+----------------------------------+
| Column        | Type   | Notes                            |
+---------------+--------+----------------------------------+
| id            | uuid   | Primary key                      |
| follower_id   | uuid   | User who is following            |
| following_id  | uuid   | User being followed              |
| created_at    | timestamp | Auto-generated                |
+---------------+--------+----------------------------------+

Constraints:
- UNIQUE(follower_id, following_id)
- CHECK (follower_id != following_id) -- Can't follow yourself
```

### 3. Storage Bucket for Avatars

Create a public bucket `avatars` for user avatar uploads:
- Public read access (anyone can view avatars)
- Authenticated users can upload/update their own avatar

### 4. Triggers

- `update_user_follow_counts()`: Increment/decrement follower_count and following_count on INSERT/DELETE

### 5. RLS Policies

**profiles table updates:**
- SELECT: Public profiles viewable by anyone; private profiles only by owner

**user_follows:**
- SELECT: Anyone can view follows (for displaying follower/following lists)
- INSERT: Only `auth.uid() = follower_id`
- DELETE: Only `auth.uid() = follower_id`

---

## Component Architecture

### Public Profile Page (`/u/:userId`)

Layout structure:
```text
+----------------------------------------------------------+
|  AppHeader                                                |
+----------------------------------------------------------+
|                                                           |
|   +----------+   Display Name              [Edit Profile] |
|   |  Avatar  |   Joined Jan 2025           (if own)       |
|   |   80px   |   Bio text here...                         |
|   +----------+                             [Follow]       |
|                                            (if not own)   |
|              12 Followers  ·  8 Following                 |
|                                                           |
+----------------------------------------------------------+
|  Tabs: [Blueprints] [Inventories] [Liked] [Activity]      |
+----------------------------------------------------------+
|                                                           |
|   3-4 recent items for active tab                         |
|   [See All →] link if more exist                          |
|                                                           |
+----------------------------------------------------------+
```

**Private Profile Notice**: If visiting someone else's private profile, show:
```text
"This profile is private."
```

### Settings Page (`/settings`)

Sections:
1. **Profile** - Display name, avatar (URL or upload), bio
2. **Privacy** - Toggle "Make profile public"
3. **Account** - Email (read-only), password change link (future)

---

## New Files to Create

| File | Purpose |
|------|---------|
| `src/pages/UserProfile.tsx` | Public profile page |
| `src/pages/Settings.tsx` | Account settings (moved from Profile.tsx) |
| `src/hooks/useUserProfile.ts` | Fetch public profile data + content |
| `src/hooks/useUserFollows.ts` | Follow/unfollow mutations |
| `src/components/profile/ProfileHeader.tsx` | Avatar, name, bio, stats |
| `src/components/profile/ProfileTabs.tsx` | Content tabs component |
| `src/components/profile/FollowButton.tsx` | Follow/unfollow toggle |
| `src/components/profile/AvatarUpload.tsx` | Combined URL input + file upload |
| `src/components/profile/ActivityFeed.tsx` | Recent activity items |
| `src/components/profile/FollowersList.tsx` | Modal showing followers/following |

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/App.tsx` | Add `/u/:userId`, `/settings` routes; redirect `/profile` |
| `src/components/shared/UserMenu.tsx` | Update links: "My Profile" → `/u/:id`, "Settings" → `/settings` |
| `src/pages/Wall.tsx` | Make avatar/name clickable → `/u/:userId` |
| `src/pages/BlueprintDetail.tsx` | Make creator avatar clickable |
| `src/contexts/AuthContext.tsx` | Add new profile fields to interface |

---

## Implementation Order

| Step | Task | Priority |
|------|------|----------|
| 1 | Database migration (profiles columns, user_follows, triggers, storage bucket) | High |
| 2 | Create `useUserProfile.ts` hook | High |
| 3 | Create `useUserFollows.ts` hook | High |
| 4 | Build `AvatarUpload.tsx` component (URL + file upload) | High |
| 5 | Build `Settings.tsx` page (migrate from Profile.tsx) | High |
| 6 | Build `ProfileHeader.tsx` component | High |
| 7 | Build `FollowButton.tsx` component | High |
| 8 | Build `ProfileTabs.tsx` with 4 tabs | Medium |
| 9 | Build `ActivityFeed.tsx` component | Medium |
| 10 | Build `UserProfile.tsx` page | High |
| 11 | Build `FollowersList.tsx` modal | Medium |
| 12 | Update `App.tsx` routes | High |
| 13 | Update `UserMenu.tsx` navigation | High |
| 14 | Update `Wall.tsx` - clickable avatars | Medium |
| 15 | Update `BlueprintDetail.tsx` - clickable creator | Medium |
| 16 | Delete old `Profile.tsx` | Low |

---

## Technical Details

### Avatar Upload Implementation

The `AvatarUpload` component will:
1. Show current avatar preview
2. Provide two input options:
   - **URL Input**: Paste any image URL
   - **File Upload**: Click to select/drag image file
3. On file upload:
   - Upload to `avatars/{userId}/{timestamp}.{ext}` in storage
   - Get public URL
   - Save URL to profile

### Activity Feed Data

Query recent actions (limit 4):
- Blueprints created by user
- Blueprints liked by user
- Comments made by user

Combine and sort by `created_at` descending.

### Profile Tabs Implementation

Each tab shows 3-4 recent items:

| Tab | Query | Display |
|-----|-------|---------|
| Blueprints | User's public blueprints | Card with title, item count |
| Inventories | User's public inventories | Card with title, description |
| Liked | Blueprints user has liked | Card with title, creator |
| Activity | Combined recent actions | Timeline items |

"See All" link appears if count > shown.

### Follow Button States

```text
[+ Follow]          - Not following, can click to follow
[Following ✓]       - Currently following, hover shows "Unfollow"
(hidden)            - Viewing own profile
```

---

## User Experience Flows

### Viewing Another User's Profile

1. Click avatar/name on Wall or Blueprint detail
2. Navigate to `/u/{userId}`
3. If profile is public: See their content, bio, stats
4. If profile is private: See "This profile is private" message
5. Click "Follow" to follow them

### Managing Own Profile

1. Click avatar in header → "My Profile" to view public profile
2. Click avatar in header → "Settings" to edit profile info
3. In Settings: Toggle "Make profile public" to enable/disable
4. Upload avatar via file picker or paste URL

### Making Profile Public

1. Go to Settings
2. Toggle "Make my profile public"
3. Profile now visible at `/u/{userId}` to anyone
4. Blueprints/Inventories on profile respect their own `is_public` flags

---

## Edge Cases Handled

- **Private profile visited by stranger**: Show "This profile is private" message
- **Private profile visited by owner**: Show full profile with "Make public" prompt
- **User with no public content**: Show empty tabs with encouraging message
- **Following yourself**: Prevented by database constraint
- **Avatar upload fails**: Fall back gracefully, show error toast
- **Large avatar files**: Limit to 2MB, resize on client before upload

---

## Future Enhancements (Not in This Plan)

- "Following" feed tab on Wall
- Notifications when someone follows you
- Profile cover/banner image
- Social links (Twitter, website)
- Block/mute users
- Profile verification badges

