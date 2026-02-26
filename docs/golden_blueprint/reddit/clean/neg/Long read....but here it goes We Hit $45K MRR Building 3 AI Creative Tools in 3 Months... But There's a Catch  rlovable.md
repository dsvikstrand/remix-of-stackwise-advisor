**TL;DR:** We migrated our professional AI pre-visualization suite from traditional development to Lovable. What took us a year of grinding got us to maybe 20% done. Three months on Lovable? We're at 80%+ and shipping features weekly. We crossed $45K MRR... but here's the twist: most of that revenue still comes from our studio team doing the work, not the tools alone. Here's the real story with actual data. (Yes, Opus helped me write this. And I am cool with it.)

**Who I Am**

I'm Pakko De La Torre, Founder & CEO of AIM, represented by [ATRBUTE](https://www.atrbute.com/) in NY, LA and UK.

I'm Creative Director, AI filmmaker, and technologist. I build campaigns the Hollywood way: pre-visualizing in hours, producing at scale with custom AI pipelines, and optimizing by signal.

I've been trusted by global brands like Netflix, SpaceX, Old Navy, L'Oréal, Toyota, Pepsi, H&M, adidas, and Oracle, with experience from major agencies including TBWA, Ogilvy, and Havas. I lead AIM's global teams across Los Angeles, Mexico City, Madrid, São Paulo, and Dubai, delivering fast, compliant, production-ready work.

Outside of AIM, I'm a founding member and CCO of XRAI (advancing AR with AR2 smart glasses), and I'm developing an AI film with Universal Pictures. All of this frontier R&D feeds directly back into what we build for clients.

My focus is simple: integrate AI to boost speed and quality, enabling growth without increasing headcount.

**The Products**

We're building AIM Creative OS — a suite of research-driven creative tools for professional creators:

\- **AIM Keyframe** — Visual-first AI for deterministic camera angles, lighting setups, and cinematic looks. Upload a reference, control camera position with sliders (not prompts), get consistent frames every time. And much more.

\- **AIM Director** — AI video generation with spatial camera blocking. Think "direct a scene in 3D space, then render it." Plus the world's only live directing module. (Early beta)

\- **AIM Sequence** — Script-to-storyboard pipeline system with character continuity across frames and integrates well with our other two platforms.

These aren't consumer "type a prompt and pray" tools. They're professional instruments with granular controls — focal length, aperture, camera orbit, lighting rigs, 100+ cinematic look profiles. The kind of thing you'd expect from After Effects or even Unreal, not Midjourney.

**The Old Way: One Year of Pain**

Before Lovable, we were building this the traditional way:

\- React + TypeScript frontend (fine)

\- Supabase backend (fine)

\- Edge functions for AI orchestration (fine)

\- Some Three.js stuff solved

\- But the iteration speed? Brutal.

**We had:**

\- ~15 database tables designed

\- Basic authentication working

\- A rudimentary generation pipeline

\- Maybe 30% of the UI vision implemented

**Time spent:** ~8-12 months

Team: 3-5 people

Burnout level: High

The problem wasn't the tech stack. The problem was the sheer volume of UI work required for a professional creative tool. Every slider, every panel, every modal, every edge case. When you're building something with the complexity of Lightroom or After Effects, you're looking at hundreds of components.

**The Whim That Changed Everything**

Honestly? We tried Lovable on a whim. One of those "let's just see what this AI coding thing can do" moments.

We started by describing our existing architecture. Then we asked it to build a component. Then another. Then a whole page.

Within one week, we had rebuilt what took us 3 months the old way. Not a stripped-down version — the actual thing, with proper TypeScript types, Tailwind styling matching our design system, and working Supabase integration.

We looked at each other and said: "We're migrating everything."

**Three Months Later: The Data**

Here's where we are now:

Database Architecture

\- More than 47 tables with proper RLS policies per platform

\- Complex relationships: projects → jobs → frames → animations

\- Subscription management with Stripe integration

\- Team collaboration with role-based permissions

\- Activity logging and analytics

\- Dead letter queues for failed jobs

**Features Shipped**

\- 3D Virtual Studio — Three.js-based camera positioning with real-time orbit controls

\- Continuity Lock™ — Proprietary identity preservation across generated frames

\- 100+ Look Profiles — From Film Noir to Tokyo Night to Portra 400

\- Director's Toolkit — Shot size, focal length, camera angle, lighting presets

\- Multi-model Orchestration — Dynamically routes to Gemini, Flux, Kling, LTX-2 based on task

\- Client Review Portal — Shareable links with approval workflows and annotations

\- Up to 32K Upscaling — Progressive upscaling chain (4K→8K→16K→32K)

\- Frame Animations — Image-to-video with camera LoRAs

\- CineForge 3D Composer — Full 3D scene staging with Gaussian splats and HDRI environments

**The 80/20 Reality**

We got to about 80% complete remarkably fast. The remaining 20%? That's the manual checking, edge case handling, and refinement that requires human judgment:

\- Reviewing generated TypeScript for type safety edge cases

\- Testing complex async flows (job queues, webhook handlers)

\- Fine-tuning animations and micro-interactions

\- Ensuring RLS policies actually protect what they should

\- Performance optimization for large galleries (1000+ frames)

This isn't a criticism — it's expected....The 80% that Lovable handles is the grunt work that used to consume 80% of our time. Now we spend our time on the 20% that actually requires expertise.

**And now...The $45K MRR Reality Check**

Here's where I have to be honest with you.

We crossed $45K MRR.....that's real revenue, real paying customers. But here's the twist:

Most of that revenue still comes from our studio services at [AIM World](https://aimworld.ai/), not the tools alone.

What does that mean? Clients are paying for the platforms, but they're still heavily relying on our team to do the actual work. They have access to the same tools we use internally, but many prefer (or need) our studio staff to operate them.

**The Numbers Breakdown**

Platform subscriptions: ~30% (Growing)

Studio services (team-operated): ~70% (Still dominant)

**Why This Matters**

This isn't a failure....it's validation with a roadmap.

1.  The tools work. Our studio team uses them daily to deliver client work faster than ever. (We had them before before we added nice UIs)

2.  The UX gap exists. Clients aren't fully self-serving yet. There's a deep learning curve.

3.  The opportunity is clear. Every percentage point we shift from "studio services" to "self-serve platform" improves our margins dramatically.

**Our Goal**

Phase out the daily studio involvement. Not eliminate our team....but evolve them from operators to enablers.

The endgame: a professional creator anywhere in the world opens AIM Keyframe, stages their shot in 3D, hits "Action!", and gets production-ready frames without needing us on a Zoom call.

We're not there yet....But we're building toward it every week.

**Unique Platform Features (What Makes Us Different)**

The "Keyframe Formula"

Every product follows: Single professional input → Multiple AI-generated production-ready outputs

No prompt boxes. No "describe what you want." Instead:

\- Upload a reference image

\- Position your camera in 3D space

\- Adjust lighting with visual controls

\- Hit "Action!" and get deterministic, reproducible results

**Visual-First Controls**

We call it the "Creative Flow Imperative" — rejecting the dry prompt-box approach in favor of controls that match how professionals actually think. A cinematographer thinks in focal lengths and f-stops, not text descriptions.

**Multi-Model Orchestration**

Behind the scenes, we dynamically select the optimal AI model based on the task:

\- Image generation → Flux/Gemini/Seedance/etc

\- Video generation → Kling/LTX-2/Veo/etc

\- Upscaling → Specialized enhancement models

\- Analysis → Gemini Pro with vision/Grok

Users never see model names. They just get the best result. (Most don't really care)

**The "Eggs in One Basket" Question**

Yes, I've heard it. "What if Lovable shuts down? What if they change pricing? What if—"

Here's my take:

1.  The code is real code. It's React, TypeScript, Tailwind, Supabase. If we needed to eject tomorrow, we could. It's not locked in some proprietary format. (Github)

2.  The time savings are worth the risk. We're a small team. The alternative was spending 2-3 more years building at the old pace. By then, the market window closes.

3.  Velocity matters more than control at this stage. We can always slow down and take more control later. We can't get back the time spent on boilerplate.

4.  The AI is a collaborator, not a replacement. We still architect. We still review. We still make the hard decisions. Lovable handles the implementation grunt work.

**Lessons Learned**

**What Works Well**

\- Describing existing architecture first — Lovable builds better when it understands your patterns

\- Iterating in small chunks — Ask for one component, review it, then move on

\- Using the debugging tools — Console logs, network requests, the whole toolkit

\- Treating it like a junior dev — Clear instructions, code review, course correction

**What Requires More Attention**

\- Complex async logic — Job queues, webhooks, retry logic needs careful review

\- Security policies — Always manually verify RLS rules

\- Performance optimization — The first implementation works; the optimized version needs guidance

\- Edge cases — AI handles happy paths well; edge cases need explicit attention

**The Bottom Line**

**Before Lovable:**

\- 12 months

\- ~20% complete

\- Team burning out

\- Shipping maybe 1 feature/month

**After Lovable:**

\- 3 months

\- ~80% complete

\- Team energized

\- Shipping 3-5 features/week

We're not saying Lovable is magic. It's not.....It's a powerful tool that dramatically accelerates the implementation phase of building software. You still need to know what you're building. You still need to review the code. You still need to handle the hard problems.

But the hours spent writing boilerplate, wiring up components, setting up database tables, configuring auth — that's now minutes instead of days.

For a small team trying to ship professional-grade tools? That's the difference between "maybe someday" and "launching this quarter."

**Products:**

\- [AIM Keyframe](https://aimkeyframe.com/) — Now in public beta

\- [AIM Director](https://aimdirector.com/) — Now in public beta

\- [AIM Sequence](https://aimsequence.com/) — Now in public beta

Happy to answer questions about the stack, the approach, or anything else.

**Edit:** For the skeptics asking "but is the code quality good?" — yes. It generates proper TypeScript with types, follows React best practices, uses Tailwind correctly, and integrates with Supabase properly. But make sure you have a senior dev clean up some stuff.
