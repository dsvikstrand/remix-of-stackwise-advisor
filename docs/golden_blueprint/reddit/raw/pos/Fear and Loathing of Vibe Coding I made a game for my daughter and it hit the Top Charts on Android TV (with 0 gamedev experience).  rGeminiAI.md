[![r/GeminiAI - Fear and Loathing of Vibe Coding: I made a game for my daughter and it hit the Top Charts on Android TV (with 0 gamedev experience).](https://preview.redd.it/fear-and-loathing-of-vibe-coding-i-made-a-game-for-my-v0-8ej6e1hrlf8g1.png?width=1122&format=png&auto=webp&s=c8d72ae6b45b2acbb483d17ca2cbfa72147fb4de)](https://preview.redd.it/fear-and-loathing-of-vibe-coding-i-made-a-game-for-my-v0-8ej6e1hrlf8g1.png?width=1122&format=png&auto=webp&s=c8d72ae6b45b2acbb483d17ca2cbfa72147fb4de "Image from r/GeminiAI - Fear and Loathing of Vibe Coding: I made a game for my daughter and it hit the Top Charts on Android TV (with 0 gamedev experience).")

_TL;DR: I’m a Data Engineer with zero mobile dev skills who used AI to build an ad-free maze game for my daughter. It somehow ended up charting on Google Play. Here is the story of my "vibe coding" journey._

_My inventory included:_

-   _One approved vacation_
    
-   _One cancelled flight_
    
-   _A daughter refusing to go to bed_
    
-   _My ten years in Big Data (but zero combined gamedev experience)_
    
-   _Endless hype posts about new AI records_
    
-   _A free trial for Gemini_
    

_That wild mix brewed into a mobile game. While I know my way around Data, I was a total noob in mobile dev. Here is the story of how I set out to save my kid from ads and ended up vibe-coding Adventure Mazes to the top free games for Android TV in Google play._

## The Idea: "Boogers" and Prototypes

That evening, I saw the news that a new version of Gemini was crushing top competitors in key benchmarks. It claimed to be even better at writing code and solving math problems.

Since my daughter loves paper mazes, I went with simple HTML5. The first prototype featuring a penguin emoji was a hit. I typed a prompt and it became a game. She asked how it worked, so I enthusiastically drew a flowchart in draw.io. Her review? 

> Dad, this looks like boogers.

She went to sleep and Mission #1 was complete.

But I was hooked. My passion for game dev that originally got me into tech (though I do love my Big Data career) came rushing back. I finally crashed at 4 AM, resisting the urge to add just one more feature

[![r/GeminiAI - Fear and Loathing of Vibe Coding: I made a game for my daughter and it hit the Top Charts on Android TV (with 0 gamedev experience).](https://preview.redd.it/fear-and-loathing-of-vibe-coding-i-made-a-game-for-my-v0-ygwl21zslf8g1.png?width=1122&format=png&auto=webp&s=78fcfc6cef46c19f0d5838c311a4eb376d1d31ef)](https://preview.redd.it/fear-and-loathing-of-vibe-coding-i-made-a-game-for-my-v0-ygwl21zslf8g1.png?width=1122&format=png&auto=webp&s=78fcfc6cef46c19f0d5838c311a4eb376d1d31ef "Image from r/GeminiAI - Fear and Loathing of Vibe Coding: I made a game for my daughter and it hit the Top Charts on Android TV (with 0 gamedev experience).")

In the morning, my wife staged an interrogation:  
\- What time did you go to bed?  
\- Four. And I forced myself to stop! I could have kept grinding till six.  
\- Are you crazy?

Without realizing the consequences of my  next statement, I blurted out, "_Honey, it wasn't for nothing! I made a game! We’ll launch on Google Play, take off  and make millions!"_ The ice in her eyes melted: "_Oh... well, okay then._"

So, the gauntlet was thrown (by me, at my own face). Challenge accepted. Let’s get down to business.

## Proof of Vibe: from idea to a game before the coffee got cold

[![r/GeminiAI - Fear and Loathing of Vibe Coding: I made a game for my daughter and it hit the Top Charts on Android TV (with 0 gamedev experience).](https://preview.redd.it/fear-and-loathing-of-vibe-coding-i-made-a-game-for-my-v0-ax90jruvlf8g1.png?width=855&format=png&auto=webp&s=8eb1b5521423d169c513bc432349eb7aca2015cd)](https://preview.redd.it/fear-and-loathing-of-vibe-coding-i-made-a-game-for-my-v0-ax90jruvlf8g1.png?width=855&format=png&auto=webp&s=8eb1b5521423d169c513bc432349eb7aca2015cd "Image from r/GeminiAI - Fear and Loathing of Vibe Coding: I made a game for my daughter and it hit the Top Charts on Android TV (with 0 gamedev experience).")

Vacation had just started and I had almost all the time in the world. First order of business: ask the AI if I could even publish this thing to Google Play. The response sounded promising: there are tons of tools, publishing is straightforward and it could generate detailed step‑by‑step instructions for any route I chose. So the only thing left was the “minor” detail — vibe‑coding the actual game.

I slowly began extending the basic maze and adding different features on top. The AI acted as my personal game designer: it suggested music, pointed me to free asset sites and generated code for the menus and the theme system.

I was barely reviewing the code. Sure, I had experience adding JS charts to open-source BI tools and writing custom CSS, but all those nested if and for statements were still outside my comfort zone.

The "one file for everything" strategy failed quickly. The index.html file kept growing, the AI took longer to rewrite it each time and every change was like a gamble: would the icons break, or would a button stop working? More often, adding a new feature made the game crash on startup. And the chat offered a "Fix error" button that rewrote the whole file again, sometimes stopping due to connection timeout.

> Okay, time to grow up.

I asked the AI how normal developers organize projects like this. After some refactoring, our single file turned into something that looked like a real project:

/my-game/

├── index.html

├── spritemap.json      // Sprite map

├── /css/

│   └── style.css

├── /js/

│   ├── main.js         // Main file: init & game loop

│   ├── billing.js      // Payments plugin

│   └── config.js       // Level and localization config

└── /assets/

├── /images/

└── /audio/

That’s when the contrast with my day job really hit me. In the big data world, I use AI very clinically. It’s simply impossible to load the full context of messy business processes into it. You can’t explain that, sure, there are cases when an integration architecture is approved but there’s also Joe from a neighboring department who sometimes comes in on Saturdays (which is a red flag on its own), manually builds an Excel file for adjustments and might accidentally swap a couple of columns. Those cases are puzzles for a gray‑haired senior engineer. But here, in my small stand‑alone side project, everything was clean, logical and predictable.

[![r/GeminiAI - Fear and Loathing of Vibe Coding: I made a game for my daughter and it hit the Top Charts on Android TV (with 0 gamedev experience).](https://preview.redd.it/fear-and-loathing-of-vibe-coding-i-made-a-game-for-my-v0-6duaeo81mf8g1.png?width=1236&format=png&auto=webp&s=a5f7fdbae25fc3ef3e26753db311200364b41dbb)](https://preview.redd.it/fear-and-loathing-of-vibe-coding-i-made-a-game-for-my-v0-6duaeo81mf8g1.png?width=1236&format=png&auto=webp&s=a5f7fdbae25fc3ef3e26753db311200364b41dbb "Image from r/GeminiAI - Fear and Loathing of Vibe Coding: I made a game for my daughter and it hit the Top Charts on Android TV (with 0 gamedev experience).")

## From PoC to MVP, hitting every snag

At some point, development speed started to drop. Yes, we split the code into files and AI  hallucinations became fewer, but it was just a delay. Halfway through, I realized I had hit Pareto's law: the last 50% of features would take one and a half times longer than my whole vacation.

The project kept growing: new game modes, enemies with their own logic and control issues on different devices. Testing showed more and more problems. Asking the AI to "fix this" often broke or simplified working code, while the main issue stayed the same.

[![r/GeminiAI - Fear and Loathing of Vibe Coding: I made a game for my daughter and it hit the Top Charts on Android TV (with 0 gamedev experience).](https://preview.redd.it/fear-and-loathing-of-vibe-coding-i-made-a-game-for-my-v0-cexif5o2mf8g1.png?width=883&format=png&auto=webp&s=1eb5a37bb1d274eff187883c55ea860a252b46db)](https://preview.redd.it/fear-and-loathing-of-vibe-coding-i-made-a-game-for-my-v0-cexif5o2mf8g1.png?width=883&format=png&auto=webp&s=1eb5a37bb1d274eff187883c55ea860a252b46db "Image from r/GeminiAI - Fear and Loathing of Vibe Coding: I made a game for my daughter and it hit the Top Charts on Android TV (with 0 gamedev experience).")

One day I saw another post about AI reaching new records. I complained to a friend: _"Great for them, but my game freezes completely one time out of ten when hitting a ghost."_ His rhetorical reply hit a nerve: _“So who’s messing up the AI, or the guy writing bad prompts?”_ Not funny, but it made me think.

I realized my prompting style had to change. Before, I gave the AI long descriptions with all details, hoping for a full solution at once. Now I saw: the more complex the request, the worse the result. Like in real development “don't try to do everything, use small iterations instead”

Things got better: fewer hallucinations, clearer understanding of what I wanted and many bugs fixed. But the ghost freeze was still there.

[![r/GeminiAI - Fear and Loathing of Vibe Coding: I made a game for my daughter and it hit the Top Charts on Android TV (with 0 gamedev experience).](https://preview.redd.it/fear-and-loathing-of-vibe-coding-i-made-a-game-for-my-v0-jdohzkl4mf8g1.png?width=1167&format=png&auto=webp&s=e9d95994d37a82313f0455779e4386f4d476a24a)](https://preview.redd.it/fear-and-loathing-of-vibe-coding-i-made-a-game-for-my-v0-jdohzkl4mf8g1.png?width=1167&format=png&auto=webp&s=e9d95994d37a82313f0455779e4386f4d476a24a "Image from r/GeminiAI - Fear and Loathing of Vibe Coding: I made a game for my daughter and it hit the Top Charts on Android TV (with 0 gamedev experience).")

Then my "Groundhog Day" started. Evening: new hypothesis, new prompt. AI: “Got it, boss, this time it will work 100%!” Night: test, freeze. Morning at 4 AM: I was tired, with no progress.

Lying in bed and staring at the ceiling, I suddenly realized: the idiot was not the AI — it was me. I had mentored juniors and always said: _"Without logging, you can't fix bugs — unless you have psychic powers!"_ But I was trying to debug without any logs. I was breaking my own rules.

Okay, new plan. I asked the AI to add logging to the code. And it worked! The freeze was caused by a rare race condition when restarting a level. The fix was simple: give each game session a unique ID. With logs, the AI quickly found the problem and gave the right solution.

[![r/GeminiAI - Fear and Loathing of Vibe Coding: I made a game for my daughter and it hit the Top Charts on Android TV (with 0 gamedev experience).](https://preview.redd.it/fear-and-loathing-of-vibe-coding-i-made-a-game-for-my-v0-k09onco5mf8g1.png?width=861&format=png&auto=webp&s=1668a79adeabeac4bc56198144e380bcbd5235f0)](https://preview.redd.it/fear-and-loathing-of-vibe-coding-i-made-a-game-for-my-v0-k09onco5mf8g1.png?width=861&format=png&auto=webp&s=1668a79adeabeac4bc56198144e380bcbd5235f0 "Image from r/GeminiAI - Fear and Loathing of Vibe Coding: I made a game for my daughter and it hit the Top Charts on Android TV (with 0 gamedev experience).")

AI is not a magic wand. It is a tool that needs the same engineering steps as anything else: short iterations, debugging, logging. Without these basic tools, development turns into hell.

Now the main mechanics were ready: the penguin runs, ghosts fly, no more freezes. Final step: I asked the AI for instructions, created an Android project with Capacitor, built the APK and tested it on my phone. It worked perfectly. Time to think big... about the million dollars I promised my wife.

## When Vibe-Coding Hits Reality (The External API)

[![r/GeminiAI - Fear and Loathing of Vibe Coding: I made a game for my daughter and it hit the Top Charts on Android TV (with 0 gamedev experience).](https://preview.redd.it/fear-and-loathing-of-vibe-coding-i-made-a-game-for-my-v0-e9sjegf7mf8g1.png?width=1921&format=png&auto=webp&s=b82b0abb42035a3554217dd5e73a26ac7a3d3018)](https://preview.redd.it/fear-and-loathing-of-vibe-coding-i-made-a-game-for-my-v0-e9sjegf7mf8g1.png?width=1921&format=png&auto=webp&s=b82b0abb42035a3554217dd5e73a26ac7a3d3018 "Image from r/GeminiAI - Fear and Loathing of Vibe Coding: I made a game for my daughter and it hit the Top Charts on Android TV (with 0 gamedev experience).")

My monetization philosophy was simple: no ads, just one honest "Unlock All" button. The kind I'd trust with my own kid.

The AI offered a choice: use a commercial plugin (free tier) or write my own. The docs warned: _"Google Cloud setup takes 2-3 hours."_ Seriously? I'd code my own faster with AI and still have time for coffee!

AI gave a quick guide, I followed it step-by-step... APK build failed. Dependency error. Happens. After fixes, still no luck. OK, 2-3 hours for Google Cloud isn't bad.

But the universe said I hadn't learned yet.

Even with the official plugin and AI instructions, the build kept failing. I gave the AI all my info: official docs, vendor's GitHub example. It made fix after fix, but the error stayed.

I started reading the docs myself (simple idea, right?). It didn't match: not a bad repo, but a good commercial plugin. Soon I found the dependency rule for my case. But it went against the AI's advice.

For fun, I pasted the doc text into chat. AI said:

> _Yes, docs are correct, but not for your case._

Human or Machine? That is the question. I trusted my experience (and docs), followed them... error gone. Build worked. Plugin not yet, but APK ready. How many hours lost if I listened to AI blindly?

[![r/GeminiAI - Fear and Loathing of Vibe Coding: I made a game for my daughter and it hit the Top Charts on Android TV (with 0 gamedev experience).](https://preview.redd.it/fear-and-loathing-of-vibe-coding-i-made-a-game-for-my-v0-pc25e5lbmf8g1.png?width=881&format=png&auto=webp&s=5e281b4dd4e07c5611a9fa46c6f4efd02cc096ff)](https://preview.redd.it/fear-and-loathing-of-vibe-coding-i-made-a-game-for-my-v0-pc25e5lbmf8g1.png?width=881&format=png&auto=webp&s=5e281b4dd4e07c5611a9fa46c6f4efd02cc096ff "Image from r/GeminiAI - Fear and Loathing of Vibe Coding: I made a game for my daughter and it hit the Top Charts on Android TV (with 0 gamedev experience).")

At that moment, I made my new rule:  
AI is not a Senior Architect. It is your Junior Developer.

Talented and fast, but still a Junior. It misses context and "fixes" wrong things with full confidence. As Team Lead, don't follow blindly — check its code, read docs, own the commits. Otherwise, no miracle: just missed deadlines and nights debugging dumb errors.

So, the app is finally published in closed testing. Payments work, content unlocks. Victory?

## 8GB RAM ought to be enough for everybody

Not a chance. The AI reminded me Google won't approve without proper testing. Testing on a single device isn't enough; you risk ANRs and high Crash Rates, which can get your app demoted in search. Better test on Android Studio emulators.

Then I looked at my laptop. I once thought 8GB RAM was enough for everybody and for Caesar 3, Heroes of Might and Magic II and a browser. Turns out in 2025, it's not even enough to run a budget phone emulator in Android Studio.

Maybe I did something wrong, but even simple devices took forever to start, then everything lagged before the game even loaded. No time for waiting.

In my company, we also develop a mobile testing farm. I asked the office guys how to use it. It's a bit bureaucratic. Hard to explain why a Cluster Data Lead suddenly needs access for an external app.

Called the CPO. We met at a cafe. While waiting, girls at the next table talked "vibes" from a party. My eye twitched — after AI coding, that word hurts.

Colleague arrived with two golden tips:

-   Why not sign up for the public stand? 21-day trial, perfect for you.The only catch was that registration required a +7 phone number (Kazakhstan and Russia only), but for me, it was perfect.
    
-   Did you add capybaras to the game? (Not yet.)
    

Perfect! Signed up, picked low-end phones. Xiaomi 2GB RAM: OK. Samsung Android Go: looks bad.

[![r/GeminiAI - Fear and Loathing of Vibe Coding: I made a game for my daughter and it hit the Top Charts on Android TV (with 0 gamedev experience).](https://preview.redd.it/fear-and-loathing-of-vibe-coding-i-made-a-game-for-my-v0-7r8n1idgmf8g1.png?width=1600&format=png&auto=webp&s=78e796c653faed56986943c8492d8214cbaa6542)](https://preview.redd.it/fear-and-loathing-of-vibe-coding-i-made-a-game-for-my-v0-7r8n1idgmf8g1.png?width=1600&format=png&auto=webp&s=78e796c653faed56986943c8492d8214cbaa6542 "Image from r/GeminiAI - Fear and Loathing of Vibe Coding: I made a game for my daughter and it hit the Top Charts on Android TV (with 0 gamedev experience).")

Optimization was needed. Luckily, Musk was offering 5 "thinking" queries per day free on Grok. I sent code to both AIs. Advice differed. So I made them "debate": copied answers from one to the other.

After rounds of AI battle ("He says your requestAnimationFrame is nonsense!"), they agreed and gave a list of optimizations. One AI is good; two are better.

Then final polish: three nights, used all tokens to find a prompt for consistent icons. Then page localization, where the AI translator hallucinated so much I checked everything with a second AI. After details, release at last.

## How I hit the Top Charts but didn't make bank (and why that’s fine)

[![r/GeminiAI - Fear and Loathing of Vibe Coding: I made a game for my daughter and it hit the Top Charts on Android TV (with 0 gamedev experience).](https://preview.redd.it/fear-and-loathing-of-vibe-coding-i-made-a-game-for-my-v0-ur09ylmimf8g1.png?width=600&format=png&auto=webp&s=07247628e2661966e8ca3e84694a65a90c5996c6)](https://preview.redd.it/fear-and-loathing-of-vibe-coding-i-made-a-game-for-my-v0-ur09ylmimf8g1.png?width=600&format=png&auto=webp&s=07247628e2661966e8ca3e84694a65a90c5996c6 "Image from r/GeminiAI - Fear and Loathing of Vibe Coding: I made a game for my daughter and it hit the Top Charts on Android TV (with 0 gamedev experience).")

A week later, the game rocketed into the "Top New" charts on Android TV and later settled into the main Top Charts. It didn’t bring in much money though.

But really, could there have been any other outcome? I made this game for a child - no ads, no pay-to-win garbage. Monetization was just a "check-the-box" feature. Sure, you _can_ access all the levels and themes at once. But as a friend pointed out, the fatal flaw in my "business plan" is that unlocking content by playing is actually way more fun than just accessing it.

On the flip side, I got tons of warm feedback. An eight-year-old girl from Chile, a grateful parent from Turkey and many others. The game found its audience. It lives and grows (fueled, of course, by my ongoing battles with AI).

[![r/GeminiAI - Fear and Loathing of Vibe Coding: I made a game for my daughter and it hit the Top Charts on Android TV (with 0 gamedev experience).](https://preview.redd.it/fear-and-loathing-of-vibe-coding-i-made-a-game-for-my-v0-gwgunhmjmf8g1.png?width=1600&format=png&auto=webp&s=e15f033bf0449b24e5a01cb5dc071186b0a68787)](https://preview.redd.it/fear-and-loathing-of-vibe-coding-i-made-a-game-for-my-v0-gwgunhmjmf8g1.png?width=1600&format=png&auto=webp&s=e15f033bf0449b24e5a01cb5dc071186b0a68787 "Image from r/GeminiAI - Fear and Loathing of Vibe Coding: I made a game for my daughter and it hit the Top Charts on Android TV (with 0 gamedev experience).")

## And why that’s fine

And this brings us to the main point.  
Despite all the hype and the glitches, AI gave me (and can give anyone) the power to build something of their own.

I have a subscription to a crossword app that I’m about to cancel. Why pay when I can spend a couple of evenings (okay, weeks) building the perfect crossword game for myself? And maybe _that's_ the one that will finally make the million. Who knows?

In short, I am tired, burnt out,  and completely drained.  
And I will absolutely do it again.