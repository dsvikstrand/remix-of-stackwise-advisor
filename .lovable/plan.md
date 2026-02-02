
# Inventory Create UX Improvement Plan

## Overview

Add the same guided tour and help system to the Inventory Create page (`/inventory/create`) that was implemented for the Blueprint Builder, with these specific preferences:

- **Tour activation**: First-time banner + permanent small compass icon
- **Button placement**: Top of page, under the main header navigation, aligned right
- **Tour scope**: Skip the quick suggestion chips (keep tour shorter/focused)
- **Visual style**: Match inventory/orange theme for the banner

---

## Implementation Summary

### 1. New Tour & Help Components

Create two new files mirroring the Blueprint Builder pattern:

**`InventoryCreateTour.tsx`**
- 4-step guided tour (keywords, generate, categories, publish)
- First-time welcome banner with orange/amber theme
- Small compass icon button for restart
- localStorage key: `inventory_create_tour_completed`

**`InventoryCreateHelpOverlay.tsx`**
- Floating tooltips for major UI elements
- Portal-based with smart positioning
- Same "?" button pattern

### 2. Button Placement Change

Move the help and tour buttons from card headers to the **AppHeader actions slot** (appears next to theme toggle). This applies to:
- **InventoryCreate.tsx** - Add tour/help buttons to header
- **InventoryBuild.tsx** - Move existing buttons from card header to page header

This creates a consistent placement across both pages: buttons appear in the top header bar, on the right side, under the main navigation.

### 3. Progressive Disclosure

Collapse "Custom instructions" and "Preferred categories" into an **Advanced Options** section to reduce initial visual noise for new users.

---

## New Files

### File 1: `src/components/inventory/InventoryCreateTour.tsx`

```typescript
// Tour steps (4 total - skipping quick suggestions)
const INVENTORY_TOUR_STEPS = [
  {
    targetId: 'keywords',
    title: 'Describe Your Inventory',
    description: 'Enter a few words like "skincare routine" or "smoothie ingredients".',
  },
  {
    targetId: 'generate',
    title: 'Generate with AI',
    description: 'Click Generate to create categories and items automatically.',
  },
  {
    targetId: 'edit-categories',
    title: 'Review & Edit',
    description: 'Rename categories, add items, or remove what you don\'t need.',
  },
  {
    targetId: 'publish',
    title: 'Create & Build',
    description: 'Publish your inventory and start creating blueprints!',
  },
];
```

**Exports:**
- `InventoryCreateTour` - Main tour overlay component
- `InventoryTourBanner` - First-time welcome banner (orange/amber themed)
- `InventoryTourButton` - Small compass icon button
- `isInventoryTourCompleted()` - Check localStorage
- `resetInventoryTour()` - Clear localStorage

**Banner Styling (orange theme):**
- Border: `border-orange-500/30`
- Background: `bg-orange-500/5`
- Icon container: `bg-orange-500/10`
- Icon color: `text-orange-500`

### File 2: `src/components/inventory/InventoryCreateHelpOverlay.tsx`

```typescript
const INVENTORY_HELP_DEFINITIONS = [
  { id: 'keywords', text: 'Describe what kind of inventory you want to create' },
  { id: 'generate', text: 'AI generates categories and items for you' },
  { id: 'advanced-options', text: 'Customize how AI generates your inventory' },
  { id: 'edit-categories', text: 'Rename, add, or remove categories and items' },
  { id: 'tags', text: 'Help others discover your inventory with tags' },
  { id: 'publish', text: 'Create your inventory and start building' },
];
```

**Exports:**
- `InventoryCreateHelpOverlay` - Portal-based tooltip overlay
- `InventoryHelpButton` - "?" icon button

---

## Modified Files

### File 3: `src/pages/InventoryCreate.tsx`

**Changes:**

1. **Add imports for new components**

2. **Add state for tour and help**
   ```typescript
   const [showHelp, setShowHelp] = useState(false);
   const [showTour, setShowTour] = useState(false);
   const [showTourBanner, setShowTourBanner] = useState(() => !isInventoryTourCompleted());
   ```

3. **Pass actions to AppHeader**
   ```tsx
   <AppHeader
     actions={
       <div className="flex items-center gap-1">
         <InventoryTourButton onClick={() => setShowTour(true)} />
         <InventoryHelpButton onClick={() => setShowHelp(true)} />
       </div>
     }
   />
   ```

4. **Add tour banner after AppHeader**
   ```tsx
   {showTourBanner && (
     <InventoryTourBanner
       onStartTour={() => {
         setShowTourBanner(false);
         setShowTour(true);
       }}
       onDismiss={() => setShowTourBanner(false)}
     />
   )}
   ```

5. **Collapse advanced options**
   - Wrap "Custom instructions" and "Preferred categories" in a Collapsible
   - Add Settings2 icon and "Advanced Options" label
   - Place after keywords input and generate button

6. **Add data-help-id attributes**
   - Keywords input: `data-help-id="keywords"`
   - Generate button: `data-help-id="generate"`
   - Advanced section: `data-help-id="advanced-options"`
   - Categories card: `data-help-id="edit-categories"`
   - Tags section: `data-help-id="tags"`
   - Create button: `data-help-id="publish"`

7. **Add tour and help overlays at page bottom**
   ```tsx
   <InventoryCreateTour
     isActive={showTour}
     onComplete={() => setShowTour(false)}
     onSkip={() => setShowTour(false)}
   />
   <InventoryCreateHelpOverlay
     isOpen={showHelp}
     onClose={() => setShowHelp(false)}
     onStartTour={() => {
       setShowHelp(false);
       setShowTour(true);
     }}
   />
   ```

### File 4: `src/pages/InventoryBuild.tsx`

**Changes:**

1. **Move tour/help buttons to AppHeader actions**
   - Remove TourButton and HelpButton from the Steps card header
   - Pass them as `actions` prop to AppHeader instead

2. **Update AppHeader call**
   ```tsx
   <AppHeader
     actions={
       <div className="flex items-center gap-1">
         <TourButton onClick={() => setShowTour(true)} />
         <HelpButton onClick={() => setShowHelp(true)} />
       </div>
     }
   />
   ```

3. **Simplify Steps card header**
   - Remove the buttons div, just show the title

---

## Visual Layout

### Header with Buttons (Both Pages)

```text
+-------------------------------------------------------------------------+
| [Logo] Blueprints V_1  | Home | Inventory | Wall | Tags |     [🧭] [?] [🌙] [👤] |
+-------------------------------------------------------------------------+
```

The compass (tour) and ? (help) buttons appear in the header's right side, next to the theme toggle and user menu.

### First-Time Banner (Orange Theme)

```text
+------------------------------------------+
| [🧭] New here?                           |
|      Take a quick tour to learn how to   |
|      create inventories.                 |
|                     [Maybe later] [Tour] |
+------------------------------------------+
```

Styled with orange/amber accents to match the inventory theme.

### Advanced Options (Collapsed)

```text
+------------------------------------------+
| ⚙️ Advanced Options                    ▼ |
|    Custom instructions, categories       |
+------------------------------------------+
```

When expanded, shows the existing custom instructions textarea and preferred categories section.

---

## Technical Notes

### Reusing Patterns

Both new components follow the exact same patterns as `BuildTour.tsx` and `BuildHelpOverlay.tsx`:

- **Tour**: `createPortal`, SVG spotlight mask, keyboard navigation (Escape, Enter), progress dots, localStorage persistence
- **Help**: Portal rendering, smart tooltip positioning, backdrop click dismiss

### Storage Keys

| Feature | Key |
|---------|-----|
| Inventory Create Tour | `inventory_create_tour_completed` |
| Blueprint Build Tour | `blueprint_build_tour_completed` |

### Data Attributes

Elements are tagged with `data-help-id="..."` to enable both the help overlay (shows tooltips for all) and tour (spotlights one at a time).

---

## Implementation Order

| Step | Task |
|------|------|
| 1 | Create `InventoryCreateTour.tsx` with tour, banner (orange theme), and button |
| 2 | Create `InventoryCreateHelpOverlay.tsx` with floating tooltips |
| 3 | Update `InventoryCreate.tsx`: add state, AppHeader actions, banner, data-help-ids, advanced options collapsible |
| 4 | Update `InventoryBuild.tsx`: move buttons from card header to AppHeader actions |
| 5 | Test tour flow and tooltip positioning on both pages |

---

## Expected Outcomes

1. **Consistent UX** - Both create and build pages use same header-level button placement
2. **First-time guidance** - Orange-themed banner welcomes new users on inventory create
3. **Always-accessible help** - Compass icon in header restarts tour anytime
4. **Contextual tooltips** - "?" button explains what each section does
5. **Reduced overwhelm** - Advanced options hidden by default
6. **Shorter tour** - 4 focused steps (skipping quick suggestions)
