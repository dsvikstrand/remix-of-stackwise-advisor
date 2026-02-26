I have a PhD in bioinformatics. I can write Python scripts that process genomic data. I cannot, for the life of me, build a web app. I don't know React. I didn't know what Tailwind was until 6 months ago. I still Google "how to center a div" at least once a week.

And yet I launched a SaaS 25 days ago that now has 2,000+ users, 100+ paying customers, and about $1K MRR. No co-founder, no agency, no bootcamp. Just me, Claude, Cursor, and a mass of copy-pasted Stack Overflow answers that somehow compiles.

People call it "vibe coding." I call it "I don't understand half of my own codebase but the tests pass." The product is [Plottie](https://ai.plottie.art/) — an AI tool that creates publication-ready scientific figures. Researchers describe what they want, the AI generates it, and they can edit everything on an infinite canvas. Think Canva meets ChatGPT, but for scientific papers.

Here's everything I learned.

## The Pixabay-to-Canva playbook (this was my best decision)

Before building the AI tool, I built a free discovery platform: [plottie.art](https://plottie.art/). It's a searchable database of 100,000+ scientific figures scraped from open-access papers in Nature, Science, Cell, etc. Researchers can browse, search, and save figures for inspiration.

Why build this first? Because I had no idea if the AI product would work, and I needed traffic.

The discovery site took ~2 months to build. It started ranking on Google within weeks because it's genuinely useful — if you search for "volcano plot examples" or "heatmap scientific figure," we show up. It now gets consistent organic traffic. Every page has a subtle nudge: "Want to create a figure like this? Try Plottie AI →"

This is essentially the Pixabay → Canva model:

-   **Pixabay**: Free stock photos, massive SEO traffic

-   **Canva**: The paid product that Pixabay users naturally graduate to

For us:

-   **plottie.art**: Free figure discovery, SEO traffic

-   **ai.plottie.art**: The AI creator that discovery users convert to

The discovery site now drives new users to the AI product every single day, and I spend $0 on ads. If I were starting over, I'd build the free SEO content product first every time. It's the most underrated SaaS growth hack — give away something genuinely useful, let Google do the distribution, and make the paid product the natural next step.

## The paid beta: don't test for free, test for money

When the AI tool was ready for testing, I didn't do a free beta. I charged half price from day one.

Here's why: Free users will tell you "this is great!" and never come back. Paying users — even at $6/month — will tell you exactly what's broken, because they expect it to work. The feedback quality is completely different.

I recruited on Twitter and a few research communities. 97 people joined at 50% off. Some of the best product decisions came from these 97 people:

-   They told me the chat-based UI was broken (I was copying ChatGPT's layout — chat on the left, figure on the right). Turns out researchers need to see 8-24 figures side by side, not one at a time. I scrapped it and built an infinite canvas instead.

-   They told me AI output needed to be editable. My V1 was generate → export → done. Researchers hated it. They need to tweak exact colors for journal guidelines, adjust font sizes for figure legends. AI gets you 80%, but the last 20% is what reviewers actually care about.

-   They told me they wanted diagrams, not just data plots. I built for bar charts and heatmaps. They flooded me with requests for flowcharts, pathway diagrams, and scientific illustrations.

Every one of these would have taken months longer to discover with a free beta. When someone pays, they're invested enough to actually tell you the truth.

## The numbers (raw, unfiltered)

-   **Launch date**: January 21, 2026

-   **Users**: ~2,000+ (organic only, $0 paid acquisition)

-   **Paying**: 100+

-   **MRR**: ~$1,000

-   **Infra cost**: $100-500/month (Cloudflare, Fly.io, Supabase, LLM APIs, E2B sandbox)

-   **Time to build**: ~6 months total (2 months discovery site, 4 months AI tool)

-   **My web dev background**: Zero. Literally none.

The conversion rate from free to paid is high. The problem isn't conversion. The problem is **top-of-funnel**: I need more people to know this exists.

## What I got wrong

**Marketing. All of it.**

I'm a researcher. I know how to write papers, run experiments, and present at conferences. I do not know how to market a product. My "marketing strategy" for the first month was posting on Twitter and hoping. Spoiler: hoping is not a strategy.

What's working so far:

-   **SEO via the discovery site** — this is 60%+ of our traffic. Researchers Google for figure types and find us.

-   **Word of mouth in labs** — one researcher tries it, tells their labmates. This is slow but the conversion quality is insane. When someone's PI recommends a tool, they don't comparison shop.

-   **Research communities** — posting genuine value (tutorials, figure tips) in places where researchers hang out, then mentioning Plottie when it's relevant.

What's not working:

-   Cold outreach. Researchers ignore cold DMs harder than any market I've seen.

-   Paid ads. Tried briefly. CPA was ridiculous for a $12/month product.

-   Product Hunt. We got some traffic but almost zero conversion. The PH audience doesn't overlap with working scientists.

My biggest challenge right now is distribution. The product-market fit signal is strong — people who find us tend to stay and pay. I just can't figure out how to get in front of 10x more researchers without spending money I don't have.

## Vibe coding: honest assessment

Since people will ask — yes, I built this entire thing with AI assistance. Here's the honest version:

**What works**: Claude/Cursor can scaffold a full Next.js app, write Go API endpoints, build Python FastAPI services, and handle 90% of the frontend. For someone who can't code, this is genuinely life-changing. I went from "I have an idea" to "I have a working product" in months, not years.

**What doesn't work**: Debugging. When something breaks in production at 2am and the error message is about a Supabase cookie authentication race condition, Claude gives you 5 different answers and 3 of them make it worse. I've spent entire weekends debugging issues that a real developer would fix in an hour.

**The real cost**: My codebase is probably 40% great, 40% "works but I don't know why," and 20% "this will definitely break at scale and I'm choosing not to think about it." I have tech debt that I can't even identify because I don't have the knowledge to recognize it.

But here's the thing: the product is live, people are paying for it, and the figures they're creating are actually going into published papers. Imperfect code that ships beats perfect code that doesn't exist.

## AMA

Happy to answer questions about:

-   Building for academic/research markets

-   The discovery-site-to-paid-product pipeline

-   Paid betas vs. free betas

-   Vibe coding a multi-service SaaS (frontend + backend + AI engine)

-   Anything else

**Disclosure: I'm the founder of Plottie.** This is my product. Sharing because I genuinely want to compare notes with other founders, but I'm upfront about it.
