

# Usability Improvement Plan for New Users

## Overview
This plan addresses the key friction points identified for new users, focusing on making core concepts (Inventory vs Blueprint) immediately understandable and providing guided first-use experiences.

---

## Changes Summary

### 1. Enhanced Homepage Explainer Section

**Location**: `src/components/home/HowItWorks.tsx`

**Current Issue**: The 3-step cards are too abstract and don't explain the "why"

**Changes**:
- Replace generic icons with concept illustrations
- Add one-line "why this matters" under each step
- Include a "See an example" link on the third step that opens a sample blueprint

**Copy Updates**:
```text
Step 1: "Pick an Inventory"
→ "Collections of ingredients for any topic—supplements, recipes, routines. Pick one to start building."

Step 2: "Build & Review"  
→ "Tap items you use, hit Review, and get instant AI feedback on your setup."

Step 3: "Share & Remix"
→ "Post to the Wall, comment on others, or remix what they've built."
```

---

### 2. Interactive Demo with AI Preview

**Location**: `src/components/home/DemoInventory.tsx`

**Current Issue**: Users select items but hit a dead end ("Sign up to see AI review")

**Changes**:
- Add a static preview of what an AI review looks like below the demo
- Show a collapsed "Example AI Review" accordion that expands when items are selected
- The review content is static (pre-written) to avoid API calls

**New Element**:
```
[Selected 4 items]
↓
📋 Example AI Review (static preview)
┌──────────────────────────────────────┐
│ "Great foundational stack! Vitamin   │
│ D3 + Omega-3 provide key support..." │
│ [See full review → Sign up]          │
└──────────────────────────────────────┘
```

---

### 3. First-Visit Tooltip on Inventory Page

**Location**: `src/pages/Inventory.tsx`

**Current Issue**: No guidance for first-time visitors

**Changes**:
- Add a dismissible banner/callout for users without session history
- Text: "Inventories are collections of items. Pick one and start building your Blueprint!"
- Uses localStorage to track if user has dismissed it

**Implementation**:
```typescript
// Track in localStorage: 'blueprints_inventory_intro_dismissed'
// Show callout if not dismissed
```

---

### 4. Inline Guidance on Build Page

**Location**: `src/pages/InventoryBuild.tsx`

**Current Issue**: Complex form with no progressive disclosure

**Changes**:
- Collapse "Advanced" options (Mix Notes, Review Prompt, Custom Sections) by default
- Add a small info icon/tooltip next to key fields explaining:
  - **Title**: "Name your blueprint—e.g., 'Morning Energy Stack'"
  - **Items**: "Tap any item you use. Add context like dosage or timing."
  - **Review button**: "AI will analyze your selection and give feedback"
- First-time users see a quick 3-step visual indicator at the top

**New Component**: `BuildPageGuide.tsx`
```
┌─ Step 1 ─┐ ┌─ Step 2 ─┐ ┌─ Step 3 ─┐
│ Select   │→│ Review   │→│ Publish  │
│ items    │ │ with AI  │ │ to Wall  │
└──────────┘ └──────────┘ └──────────┘
```

---

### 5. Empty State Improvement on Wall

**Location**: `src/pages/Wall.tsx`

**Current Issue**: "For You" tab shows "No blueprints yet. Follow tags to personalize your feed." but doesn't help users act.

**Changes**:
- Add inline tag suggestions directly in the empty state
- Show 4-6 popular tags as clickable chips
- Clicking follows the tag and refreshes the feed

**New Empty State**:
```
┌────────────────────────────────────────────┐
│ 🏷️ Follow tags to personalize your feed   │
│                                            │
│ [#supplements] [#skincare] [#fitness]     │
│ [#nutrition] [#meditation] [#productivity]│
│                                            │
│ Or: [Browse Latest instead]                │
└────────────────────────────────────────────┘
```

---

### 6. Glossary Tooltip Component (Optional Enhancement)

**New File**: `src/components/shared/GlossaryTip.tsx`

**Purpose**: Reusable tooltip that explains key terms on hover/click

**Usage**:
```jsx
<GlossaryTip term="inventory">
  A collection of items you can choose from—like a recipe ingredient list.
</GlossaryTip>
```

**Placement**:
- Homepage hero subtitle
- Inventory page header
- Build page header

---

## Implementation Order

| Priority | Task | Files |
|----------|------|-------|
| 1 | Improve HowItWorks copy and add links | `HowItWorks.tsx` |
| 2 | Add static AI review preview to DemoInventory | `DemoInventory.tsx` |
| 3 | Add dismissible intro callout on Inventory page | `Inventory.tsx`, new `IntroCallout.tsx` |
| 4 | Collapse advanced fields on Build page | `InventoryBuild.tsx` |
| 5 | Improve Wall empty state with inline tag follows | `Wall.tsx` |
| 6 | Create reusable GlossaryTip component | `GlossaryTip.tsx` |
| 7 | Add step indicator to Build page | `InventoryBuild.tsx`, new `BuildPageGuide.tsx` |

---

## Technical Notes

- **No database changes required** - all improvements are frontend-only
- **LocalStorage usage** - track dismissed intro callouts per page
- **New components**:
  - `IntroCallout.tsx` - reusable dismissible banner
  - `GlossaryTip.tsx` - term definition tooltip
  - `BuildPageGuide.tsx` - step progress indicator
- **Static demo review** - hardcoded example text, no API calls
- **Existing hooks reused** - `usePopularInventoryTags` for Wall empty state

---

## Expected Outcomes

1. New users understand **Inventory = template, Blueprint = your creation**
2. Demo widget shows **what AI review looks like** before sign-up
3. Build page feels **less overwhelming** with progressive disclosure
4. Wall **"For You" tab is actionable** even when empty
5. Consistent **inline help** throughout key pages

