# StackLab Social V1

> **Last Updated**: January 2026  
> **Status**: Social Loop Spec (Working)

---

## ?? Vision

Build a community-first product loop where users create stacks (Blend/Protein), decide privacy, tag them for discovery, and interact via followable tags and Reddit-style comments. The social system should feel simple, fast, and scalable to new stack pages (skincare, workouts, smoothies, etc.).

---

## ?? User Journey ("User Experiment")

1. **Sign up** (email/password)
2. **Create a stack** (Blend or Protein)
3. **Save** as private by default
4. **Make public** optionally
5. **Tag** the recipe (max 4 tags)
6. **Users follow tags** to customize their Wall feed
7. **Interact**: like, comment, bookmark

---

## ??? Tag System ("Subreddit" Style)

- Tags act like lightweight sub-communities
- If a tag does not exist, a user can create it by tagging a public recipe
- Tags have **followers count**
- No mods for now
- Users can **follow** and **mute** tags
- Tags are **recipe-level** (not per post)

**Rules**:
- Lowercase slug format
- Max 4 tags per recipe

---

## ?? Comments (Reddit Style)

- Threaded replies with unlimited depth
- Likes on comments (for "Top" sorting)
- Users can delete their own comments
- Admin moderation later

---

## ?? Wall Feed Model

Tabs:
- **For You**: posts from followed tags (excluding muted tags)
- **Latest**: global feed
- **Trending**: global feed (last 3 days)

Sort Order:
- Default: **Top (likes)**
- Optional: Latest

---

## ?? Privacy Rules

- **Private**: visible only to owner
- **Unlisted**: hidden from Wall and not shareable (effectively private)
- **Public**: appears on Wall and can be shared

---

## ?? Bookmarks

- Bookmarking saves a post privately (not a fork)
- Private list only

---

## ?? AI Review Linking

- Wall posts link to the recipe's analysis (no snapshot yet)
- Keep analysis optional on public share

---

## ? Decisions Log

- Tags behave like subreddits with followers count
- Tags are recipe-level
- Max 4 tags per recipe
- Tag slugs are lowercase
- Trending window is last 3 days
- Wall feed = For You + Latest + Trending
- Comments = unlimited threading + likes
- Bookmarks are private only
- Public/unlisted/private supported
- StackLab (Planner) stays visible but deprioritized

---

## ?? Next Build Order

1. **User experiment** (Wall + tags + follow/mute + comments + likes + bookmarks)
2. **Polish Blend/Protein** UX
3. **Add new stack pages** (skincare / workouts / smoothies)

---

## ?? Future Ideas

- Tag directory page
- Tag autocomplete + suggestions
- Recipe forking
- User profiles with badges
- Unlisted share links (later)

---

## ? Open Questions

- Do we want a Tag Directory page (browse/follow/mute)?
- How should trending scoring evolve (likes + recency)?
- Should users be able to edit tags on existing recipes?

---

*This document is a working spec to guide social-loop development and roadmap sequencing.*