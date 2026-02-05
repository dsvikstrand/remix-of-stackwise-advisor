# MVP Ship Checklist (Blueprints App)

> Goal: Ship a testable MVP where we can measure real user value (not just sign-up intent).

---

## 1) Seed Content (mandatory)
- [ ] **1.1 Seed public blueprints**
- [ ] 30–50 public blueprints ready at launch
- [ ] Cover 4–6 categories (e.g., Sleep, Skincare, Workout, Productivity, Nutrition, Recovery)
- [ ] Each blueprint has 3–8 tags
- [ ] **1.2 Quality bar**
- [ ] Each blueprint has a clear title + short description
- [ ] Each has at least 5–10 items
- [ ] Each has a coherent step/order
- [ ] **1.3 Wall/Explore/Tags feel alive**
- [ ] `/wall` has “Latest” content
- [ ] `/explore` returns results without login
- [ ] `/tags` shows trending tags (non-empty)
- [ ] Owner: ________  Target date: ________

---

## 2) Core App Remaining (before seeding)
- [ ] **2.1 Library → Build → Review → Publish works end-to-end**
- [ ] Generate Library from `/inventory/create`
- [ ] Build from `/inventory/:id/build` with items + steps
- [ ] Review returns successfully
- [ ] Publish shows in `/blueprints` and `/wall`
- [ ] **2.2 Agentic backend wired**
- [ ] Frontend requests hit `https://bapi.vdsai.cloud/api/*` (DevTools)
- [ ] `POST /api/generate-inventory` returns 200
- [ ] `POST /api/analyze-blueprint` returns 200
- [ ] `POST /api/generate-banner` returns 200
- [ ] **2.3 Edge upload for banners**
- [ ] `POST https://piszvseyaefxekubphhf.supabase.co/functions/v1/upload-banner` returns 200
- [ ] Banner URL renders on blueprint page
- [ ] **2.4 Minimal first-win logging**
- [ ] Log `view_blueprint`, `click_remix`, `save_blueprint`, `generate_ai_review`
- [ ] Owner: ________  Target date: ________

---

## 3) Remove Early Login Friction (public browsing)
- [ ] **2.1 Public access**
- [ ] Wall is viewable without login
- [ ] Explore/search is viewable without login
- [ ] Blueprint detail pages are viewable without login
- [ ] Library list is viewable without login (`/inventory`)
- [ ] **2.2 Gate only creation**
- [ ] Login required only for: Save / Remix / Publish / Comment / Like / Follow tag
- [ ] If user clicks Remix while logged out → show login modal, then continue action post-login
- [ ] Owner: ________  Target date: ________

---

## 4) Core Flow (Library → Build → Review → Publish)
- [ ] **3.1 Library generate**
- [ ] `/inventory/create` generates a Library successfully
- [ ] AI response appears with categories + items
- [ ] **3.2 Build**
- [ ] `/inventory/:id/build` loads and auto-selects first category
- [ ] Items can be added to steps and saved
- [ ] **3.3 Review**
- [ ] AI review runs and returns content
- [ ] **3.4 Publish**
- [ ] Published blueprint appears in `/blueprints` and `/wall`
- [ ] Owner: ________  Target date: ________

---

## 5) Agentic Backend Wiring (current stack)
- [ ] **4.1 Frontend uses agentic backend**
- [ ] `.env.production` sets `VITE_USE_AGENTIC_BACKEND=true`
- [ ] `.env.production` sets `VITE_AGENTIC_BACKEND_URL=https://bapi.vdsai.cloud`
- [ ] Requests hit `https://bapi.vdsai.cloud/api/*` in DevTools (not Supabase Edge)
- [ ] **4.2 Endpoints live**
- [ ] `POST /api/generate-inventory` returns 200
- [ ] `POST /api/analyze-blueprint` returns 200
- [ ] `POST /api/generate-banner` returns 200
- [ ] **4.3 Banner upload (Supabase edge)**
- [ ] Edge function `upload-banner` returns `bannerUrl`
- [ ] CORS allows `https://dsvikstrand.github.io`
- [ ] Owner: ________  Target date: ________

---

## 6) First Win Definition + Instrumentation
- [ ] **5.1 Define first win**
- [ ] First Win = Remix → edit 1 thing → Save OR AI review
- [ ] **5.2 Track funnel events**
- [ ] `visit_home`
- [ ] `view_blueprint`
- [ ] `click_remix`
- [ ] `edit_blueprint` (change count >= 1)
- [ ] `save_blueprint`
- [ ] `generate_ai_review`
- [ ] `publish_blueprint`
- [ ] `return_visit_7d`
- [ ] **5.3 Basic dashboard**
- [ ] Can see counts per step (even simple logs)
- [ ] Owner: ________  Target date: ________

---

## 7) Basic AI Guardrails (before real traffic)
- [ ] **6.1 Rate limiting**
- [ ] Per-user daily cap on AI review
- [ ] **6.2 Clear UX**
- [ ] Limit reached message + reset time
- [ ] Retries for transient failures
- [ ] **6.3 Disclaimers**
- [ ] Health/supplement disclaimer visible on relevant pages
- [ ] Owner: ________  Target date: ________

---

## 8) Frictionless First-Win UI Path
- [ ] **7.1 Remix is primary CTA**
- [ ] “Remix this” button prominent on blueprint pages
- [ ] “Remix” appears on cards in Wall/Explore
- [ ] **7.2 One-click remix**
- [ ] Remix creates a copy and opens editor immediately
- [ ] Attribution preserved (original author + link)
- [ ] **7.3 Quick success**
- [ ] Add/remove item is obvious
- [ ] Save is obvious and fast
- [ ] Owner: ________  Target date: ________

---

## 9) Feedback Capture (context-aware)
- [ ] **8.1 In-app feedback**
- [ ] Feedback button on Home + Blueprint + Build pages
- [ ] **8.2 Capture context**
- [ ] page/path, blueprint_id, user_id, timestamp
- [ ] **8.3 Storage**
- [ ] Feedback stored in table/email/Slack
- [ ] Owner: ________  Target date: ________

---

## 10) Acquisition Test (minimum)
- [ ] **9.1 Traffic goal**
- [ ] 300 targeted visits within 2 weeks
- [ ] **9.2 Channels**
- [ ] Reddit niche communities
- [ ] Twitter/X or LinkedIn thread
- [ ] Discord/Slack community post
- [ ] **9.3 UTM tracking**
- [ ] `?utm_source=...&utm_campaign=mvp_test`
- [ ] **9.4 Success thresholds**
- [ ] Activation ≥10% reach First Win
- [ ] Retention ≥5% return within 7 days
- [ ] 10+ feedback items, 3+ “I’d use this weekly”
- [ ] Owner: ________  Target date: ________

---

## Notes / Decisions (fill in)
- First Win definition: `________________________________________`
- Daily AI review cap: `________________________________________`
- Launch categories/tags: `________________________________________`
- Target channels: `________________________________________`
- Success thresholds: `________________________________________`
