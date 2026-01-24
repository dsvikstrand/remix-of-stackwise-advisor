# StackLab - Project Brief

> **Last Updated**: January 2025  
> **Status**: MVP Complete | Hobby/Side Project Phase

---

## 🎯 Vision

StackLab is a **community-first platform for discovering and sharing optimal "stacks"** — curated combinations of supplements, ingredients, or routines designed to achieve specific goals. 

**The big picture**: Start with supplements, then expand to **skincare routines, smoothie recipes, workout splits**, and beyond. The core value proposition is helping users find and share *what works together*.

---

## 🧩 Core Features

### 1. StackLab Planner (`/`)
AI-assisted supplement stack builder:
- Select supplements from inventory
- Define goals (energy, sleep, focus, etc.)
- Configure dose strength & frequency
- Get personalized regimen recommendations with safety checks

### 2. Blend Builder (`/blend`)
Custom supplement "cocktail" creator:
- Add supplements with precise dosages (mg, g, scoops, etc.)
- AI analysis provides: synergy scores, timing recommendations, warnings, ROI breakdown
- Save and share blends publicly

### 3. Complete My Protein (`/protein`)
Protein shake optimizer:
- Combine protein sources (whey, casein, plant-based, etc.)
- AI analyzes amino acid completeness, absorption profiles, optimal timing
- Track total protein per shake

### 4. The Wall (`/wall`)
Social feed for the community:
- Share public recipes with captions
- Like and discover others' stacks
- Recipe type badges (blend/protein/stack)

### 5. My Recipes (`/my-recipes`)
Personal recipe dashboard:
- View all saved blends, protein shakes, and stacks
- Filter by type
- Share to Wall or delete

---

## 👥 Target Audience

| Segment | Description | Priority |
|---------|-------------|----------|
| **Biohackers / Longevity** | Advanced users stacking for cognitive/longevity goals | Early adopters |
| **Fitness Enthusiasts** | Gym-goers, athletes, bodybuilders optimizing performance | Core audience |
| **Health-Conscious Consumers** | General wellness seekers exploring supplements | Growth audience |
| **Nutritionists / Coaches** | Professionals building plans for clients | Future B2B |

---

## 💰 Business Model

**Phase 1 (Current)**: Ad-supported  
**Phase 2**: Freemium + Premium
- Free tier: Limited analyses, basic history
- Premium: Unlimited AI analyses, extended history, advanced personalization, no ads

---

## 🏆 Competitive Differentiation

| vs Competitors | StackLab Advantage |
|----------------|-------------------|
| Examine.com | Community-driven stacks, not just reference data |
| MyFitnessPal | Focused on *combinations* not just tracking |
| Generic trackers | AI-powered synergy analysis + social sharing |

**Core differentiators**:
1. **Community-first**: Wall, sharing, recipe discovery
2. **Unified platform**: Supplements + protein + (future: skincare, smoothies, workouts)
3. **AI insights**: Real-time streaming analysis with actionable recommendations

---

## 📈 Roadmap

### Near-term Priorities
1. **Community features** – Comments, followers, recipe forking
2. **Personalization engine** – AI recommendations based on history/goals
3. **Mobile PWA** – Optimized mobile experience, installable

### Future Expansion
- **Skincare stacks** – Ingredient combinations for skin goals
- **Smoothie builder** – Nutrition-optimized recipes
- **Workout splits** – Training program combinations
- **Curated templates** – Pre-built stacks for common goals
- **Educational content** – Blog/wiki with guides

---

## 📊 Success Metrics

| Metric | Why It Matters |
|--------|---------------|
| **Social Engagement** | Wall posts, likes, shares – validates community value |
| **User Retention** | Weekly/monthly return rate – product stickiness |
| **Recipes Saved** | Per-user creation rate – utility validation |

---

## 🎨 Visual Identity

### Current: "Gen X Soft Club"
Late 90s / early 2000s Y2K revival aesthetic:
- **Palette**: Aqua dreamscape (soft teal, cyan, silver/chrome)
- **Effects**: Glassmorphism, iridescent highlights, ambient blob animations
- **Typography**: Hypermodern hero headers (Impact/Franklin Gothic, massive scale)
- **Themes**: Light, Dark Aqua, Dark Orange (Walkman Y2K)

### Design Direction
**Open to complete pivot** based on user feedback. Design should serve the community, not the other way around.

---

## 🔧 Technical Architecture

### Stack
| Layer | Technology |
|-------|------------|
| **Frontend** | React 18 + TypeScript + Vite |
| **Styling** | Tailwind CSS + shadcn/ui |
| **Backend** | Lovable Cloud (Supabase) |
| **Database** | PostgreSQL with RLS |
| **Auth** | Email/password + auto-confirm |
| **AI** | Lovable AI Gateway (Gemini models) |
| **Hosting** | Lovable with GitHub sync |

### Database Schema
```
profiles        – User display names, avatars, bios
user_recipes    – Unified storage (blend/protein/stack) via JSONB
wall_posts      – Social sharing with like counts
post_likes      – Like tracking (optimistic UI)
user_roles      – Role-based access (admin/moderator/user)
```

### Edge Functions
- `analyze-blend` – Streaming AI analysis for supplement blends
- `analyze-protein` – Streaming AI analysis for protein shakes
- `generate-stack` – AI-generated supplement recommendations

### Key Patterns
- **Streaming SSE** for real-time AI responses
- **Optimistic UI** for likes and social actions
- **LocalStorage fallback** for guest mode
- **RLS policies** for secure multi-tenant data

---

## 📂 Project Structure

```
src/
├── components/
│   ├── blend/          # Blend Builder components
│   ├── protein/        # Protein Builder components
│   ├── shared/         # AppNavigation, UserMenu, SaveRecipeButton
│   └── ui/             # shadcn/ui components
├── contexts/
│   └── AuthContext.tsx # Auth state management
├── hooks/
│   ├── useBlendState.ts
│   ├── useProteinState.ts
│   ├── useRecipes.ts
│   └── useStackLabState.ts
├── pages/
│   ├── Index.tsx       # StackLab Planner
│   ├── Blend.tsx       # Blend Builder
│   ├── Protein.tsx     # Complete My Protein
│   ├── Wall.tsx        # Social feed
│   ├── MyRecipes.tsx   # Recipe dashboard
│   └── Auth.tsx        # Login/Signup
├── types/
│   └── stacklab.ts     # Core type definitions
└── lib/
    ├── prompts.ts      # AI prompt templates
    └── blendPrompts.ts # Blend-specific prompts

supabase/
├── functions/          # Edge Functions
└── migrations/         # Database migrations
```

---

## 🚀 Current State

**MVP Complete** ✅
- [x] Three core tools (Planner, Blend, Protein)
- [x] User authentication
- [x] Persistent recipe storage
- [x] Social Wall with likes
- [x] AI-powered streaming analysis
- [x] Theme system (3 modes)
- [x] GitHub sync enabled

**Next Steps**:
- [ ] Comments on Wall posts
- [ ] User following system
- [ ] Recipe forking
- [ ] PWA optimization
- [ ] Curated starter templates

---

## 📝 Content Strategy

1. **User-generated guides** – Community members share knowledge
2. **Curated starter templates** – Pre-built stacks for common goals
3. **Educational blog/wiki** – Supplement deep-dives, timing guides

---

## 🔗 Links

- **Preview**: https://id-preview--c7c6d04b-9eef-4adc-8881-d2f4a93bd194.lovable.app
- **Repository**: Connected via Lovable GitHub sync

---

*This document serves as a comprehensive onboarding reference for AI collaborators, developers, and stakeholders.*
