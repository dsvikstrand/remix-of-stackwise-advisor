
# Explore Page Implementation Plan

## Overview

Add a new public **Explore** page (`/explore`) as a search-first discovery hub for Blueprints, Inventories, and Users. The page emphasizes a minimal, search-forward design with unified results across all content types.

---

## Key Design Decisions

Based on your preferences:

| Preference | Implementation |
|------------|----------------|
| Public access | No login required (like Wall) |
| All content types | Blueprints, Inventories, Users searchable |
| Search-first | Large search bar at top, minimal content below until searching |
| Separate from Wall | Wall = social feed, Explore = cross-content search |
| Minimal tags | Small inline chips (no tag clouds) |
| User cards | Compact cards with avatar, name, follower count, follow button |

---

## Page Layout

```text
+----------------------------------------------------------+
| [Header with AppNavigation - Explore tab highlighted]    |
+----------------------------------------------------------+
|                                                          |
|  +----------------------------------------------------+  |
|  | [Search icon]  Search blueprints, inventories...   |  |
|  +----------------------------------------------------+  |
|                                                          |
|  [Blueprints] [Inventories] [Users]  <- filter pills     |
|                                                          |
|  ------------------------------------------------        |
|                                                          |
|  [Results grid/list - appears after typing]              |
|                                                          |
|  OR (when empty):                                        |
|                                                          |
|  Trending Tags: [#tag1] [#tag2] [#tag3] ...              |
|                                                          |
+----------------------------------------------------------+
```

### Empty State (Before Search)
- Large centered search bar
- Optional subtle "Trending Tags" row (5-6 small chips, clickable to filter)
- Minimal visual noise

### Active Search State
- Filter pills: "All" | "Blueprints" | "Inventories" | "Users"
- Results grouped by type (if "All" selected) or filtered to single type
- Results appear as you type (debounced 300ms)

---

## Navigation Update

Add "Explore" to `AppNavigation.tsx`:

```typescript
const navItems = [
  { path: '/', label: 'Home', icon: Home, isPublic: true },
  { path: '/explore', label: 'Explore', icon: Search, isPublic: true },  // NEW
  { path: '/inventory', label: 'Inventory', icon: Layers, isPublic: false },
  { path: '/wall', label: 'Wall', icon: Users, isPublic: true },
  { path: '/tags', label: 'Tags', icon: Tag, isPublic: false },
];
```

---

## New Files

### 1. `src/pages/Explore.tsx`

Main page component with:
- Search input with debounce
- Filter pills (All | Blueprints | Inventories | Users)
- Conditional rendering based on search state
- Empty state with trending tags

### 2. `src/hooks/useExploreSearch.ts`

Unified search hook that:
- Accepts query string and filter type
- Searches across blueprints (title, tags), inventories (title, tags), and profiles (display_name)
- Returns combined, typed results
- Handles empty query (returns trending/popular content)

### 3. `src/components/explore/ExploreResultCard.tsx`

Polymorphic result card that renders differently based on type:
- **Blueprint**: Title, item count, creator avatar, like count, tags
- **Inventory**: Title, category count, blueprint count, tags
- **User**: Avatar, display name, bio snippet, follower count, follow button

### 4. `src/components/explore/UserMiniCard.tsx`

Compact user card component:
- Small avatar (32x32)
- Display name
- Follower count
- Follow/Unfollow button (inline)

---

## Modified Files

### 1. `src/components/shared/AppNavigation.tsx`

- Add Explore nav item with `Search` icon
- Mark as `isPublic: true`

### 2. `src/App.tsx`

- Add route: `<Route path="/explore" element={<Explore />} />`

---

## Data Flow

```text
User types in search bar
        |
        v
useExploreSearch(query, filter)
        |
        +--> Blueprints: .ilike('title', '%query%') + tag match
        +--> Inventories: .ilike('title', '%query%') + tag match
        +--> Users: .ilike('display_name', '%query%'), is_public=true
        |
        v
Combined results with type discriminator
        |
        v
ExploreResultCard renders per type
```

---

## Search Logic Details

### Blueprint Search
```typescript
// Search by title
const titleMatches = await supabase
  .from('blueprints')
  .select('id, title, selected_items, likes_count, creator_user_id, created_at')
  .eq('is_public', true)
  .ilike('title', `%${query}%`)
  .order('likes_count', { ascending: false })
  .limit(20);

// Also search by tag slug
const tagMatches = await supabase
  .from('tags')
  .select('id')
  .ilike('slug', `%${normalizedQuery}%`);
// Then join via blueprint_tags
```

### Inventory Search
Reuse existing `useInventorySearch` pattern with `.ilike('title', ...)` and tag matching.

### User Search
```typescript
const users = await supabase
  .from('profiles')
  .select('user_id, display_name, avatar_url, bio, follower_count')
  .eq('is_public', true)
  .ilike('display_name', `%${query}%`)
  .order('follower_count', { ascending: false })
  .limit(15);
```

---

## Component Specifications

### UserMiniCard Props
```typescript
interface UserMiniCardProps {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  followerCount: number;
}
```

Renders as:
```text
+------------------------------------------+
| [Avatar] Display Name                    |
|          12 followers    [Follow]        |
+------------------------------------------+
```

### Filter Pills
Simple toggle group using existing `Button` component with `variant="outline"` for inactive and `variant="default"` for active.

---

## Tag Interaction

- Tags appear as small `Badge` components on result cards
- Clicking a tag fills the search bar with `#tag-slug` and filters results
- Search supports `#tag` syntax: if query starts with `#`, treat as tag-only search

---

## Empty/Default State

When search is empty, show:
1. Centered search bar with placeholder "Search blueprints, inventories, users..."
2. Below: "Trending" section with 5-6 most-followed tags as small chips
3. Optional: 2-3 featured blueprints (most liked this week)

---

## Technical Notes

### Debouncing
Use 300ms debounce on search input to reduce API calls.

### Result Limits
- Blueprints: 20 max
- Inventories: 20 max
- Users: 15 max

### RLS Considerations
- Blueprints: `is_public = true` filter
- Inventories: `is_public = true` filter
- Profiles: RLS policy already restricts to `is_public = true OR auth.uid() = user_id`

### Following Users
Reuse existing `useFollowUser` and `useUnfollowUser` mutations from `useUserFollows.ts`.

---

## Implementation Order

| Step | Task |
|------|------|
| 1 | Update `AppNavigation.tsx` to add Explore tab |
| 2 | Add `/explore` route in `App.tsx` |
| 3 | Create `useExploreSearch.ts` hook with unified search logic |
| 4 | Create `UserMiniCard.tsx` component |
| 5 | Create `ExploreResultCard.tsx` polymorphic component |
| 6 | Create `Explore.tsx` page with search UI, filters, and results |
| 7 | Test search across all content types |

---

## Expected Outcomes

1. **Unified Discovery**: One place to search all content types
2. **Search-First UX**: Minimal visual noise, prominent search bar
3. **User Discovery**: Find and follow creators directly from search
4. **Tag Integration**: Seamless tag-based filtering with `#tag` syntax
5. **Public Access**: No login barrier for exploration
6. **Distinct from Wall**: Wall remains the social feed; Explore is the search hub
