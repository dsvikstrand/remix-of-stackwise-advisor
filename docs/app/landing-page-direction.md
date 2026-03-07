# Landing Page Direction

## Purpose
- [have] The landing page at `/` is a signed-out-first product narrative, not a documentation page.
- [have] Its job is to win attention quickly, explain why Bleu is useful, and push one clear first action.
- [have] It should feel more premium and memorable than the rest of the app without becoming a detached art piece.

## Locked Choices
- [have] Audience: signed-out users first.
- [have] Signed-in users still see the landing page, but with product CTAs instead of onboarding-first CTAs.
- [have] Primary signed-out CTA: `Try a video`.
- [have] Primary signed-in CTA: `Open Create`.
- [have] Secondary signed-in CTA: `Open Home`.
- [have] Visual tone: editorial premium.
- [have] Motion level: moderate cinematic, not full scroll hijack.
- [have] Demo style: curated real blueprint examples and guided mock scenes, not live feed data.

## Story Structure
- [have] Beat 1: `YouTube is full of value. Most of it gets buried.`
- [have] Beat 2: `Bleu turns long videos into blueprints you can scan in seconds.`
- [have] Beat 3: `Get your favorite creators' new videos as blueprints.`
- [have] Beat 4: `Find the best new videos without spending hours watching everything.`

## Page Structure
- [have] Layer 1: cinematic sticky hero with four scroll beats, evolving background art, and curated app demos.
- [have] Layer 2: grounded proof sections for:
  - `How Bleu works`
  - `For You / Joined / All`
  - `Why Bleu is useful`
  - final CTA

## Motion Rules
- [have] Use transform/opacity motion only for the core story transitions.
- [have] Keep the background animated but subordinate to the copy and demo frames.
- [have] Hero background geometry follows deterministic perimeter-safe SVG rails and reverses cleanly when the user scrolls back up.
- [have] The hero keeps `framer-motion` for text/demo transitions and uses GSAP path motion only for the background glyph layer.
- [have] Decorative motion stays behind the copy/demo safe zones and uses a small fixed set of shapes rather than random particle noise.
- [have] Support `prefers-reduced-motion`.
- [have] Mobile keeps the same narrative but with lighter transforms and a shorter sticky section.

## CTA Rules
- [have] Signed-out:
  - primary: `/youtube`
  - secondary: scroll to `How Bleu works`
  - tertiary: `/auth`
- [have] Signed-in:
  - primary: `/search`
  - secondary: `/wall`
  - tertiary: scroll to `How Bleu works`

## Analytics
- [have] Landing V2 uses dedicated events:
  - `landing_view_v2`
  - `landing_hero_cta_click`
  - `landing_story_step_view`
  - `landing_demo_cta_click`
  - `landing_final_cta_click`

## Progress
- [have] Landing V2 prototype direction is locked.
- [have] Cinematic hero + curated product scenes are implemented on `/`.
- [have] Scroll-synced geometric background motion is implemented for the hero via perimeter-safe SVG rails.
- [have] Signed-in and signed-out CTA variants are implemented.
- [todo] Add the first-timer tour after the landing page settles.
- [todo] Add more contextual helper copy inside the product after the landing page settles.
- [todo] Review conversion and scroll-depth analytics after live usage.
