[![r/ClaudeCode - This is what 3k hours in CC looks like](https://preview.redd.it/this-is-what-3k-hours-in-cc-looks-like-v0-h0dx8rqfybkg1.png?width=1920&format=png&auto=webp&s=7eefb74c56f79c59a123f09555e0d7e0ed3aca5f)](https://preview.redd.it/this-is-what-3k-hours-in-cc-looks-like-v0-h0dx8rqfybkg1.png?width=1920&format=png&auto=webp&s=7eefb74c56f79c59a123f09555e0d7e0ed3aca5f "Image from r/ClaudeCode - This is what 3k hours in CC looks like")

**UPDATE:** Wow. The magic of reddit... Thank you all! A team has formed, we're shipping next week, and the project has a name. [It's called Valence](https://itscalledvalence.cc/). Join our mailing list if you want to know when it drops. [More details.](https://www.reddit.com/r/ClaudeCode/comments/1rev1zu/3k_hours_in_cc_part_2_the_magic_of_reddit/)

After an unholy amount of iteration, I've ended up with a integrated operating environment in Claude Code that actually works, combining First Principles + spec-driven + test-driven + atomic tasks, in a grounded team-based workflow with formalized quality gates, adversarial reviews and auditable hand-offs.

The cold-start token cost is .8% of 200k. Agent teams are used where sensible, and the task formatting integrates seamlessly with the native task management.

The core idea: code is a liability; judgement is an asset. Most setups I see go **prompt → plan → code**. Mine goes **idea → crystallized brief → grounded first-principles design → adversarial review → design iteration → atomic planning → parallel build → build validation → QA pipeline → security review**. Every transition is a quality gate that blocks forward progress until validation passes, and context never contains more than whats in scope for the task.

What it looks like in practice:

**/arm** — You dump your fuzzy thoughts. Opus extracts requirements, constraints, non-goals, style, and key concepts through conversational Q&A, then forces remaining decisions in a single structured checkpoint. Output is a brief, not a design.

**/design** — Opus takes the brief and does first-principles analysis. Every constraint gets evaluated and classified. Soft constraints treated as hard constraints get flagged. It reconstructs the optimal approach from only validated truths, researches via Context7 (live library docs) and web search, aligns with codebase patterns then iterates with you until alignment. Output is a formal design document.

**/ar** — Three models critique your design in parallel, each with different training data and blind spots; Opus, Kimi and GLM. The last two run as teammates through a Haiku proxy and custom external agent runner, all three grounds their take with filesystem access and Context7. The team lead deduplicates findings, fact-checks each against your actual codebase, runs cost/benefit analysis on the findings, and outputs a structured report for human review. This loops until the issues flagged no longer warrant mitigation as per the cost/benefit analysis.

**/plan** — Opus transforms the approved design into an execution document so specific that Sonnet build agents never ask clarifying questions. ~5 tasks per agent, no file conflicts between groups, exact file paths, complete code examples showing the patterns, named test cases with setup and assertions. Tasks are atomic with non-negotiable acceptance criteria.

**/pmatch** — Drift detection, mechanized. Two agents (Sonnet + Kimi) independently extract claims from a source-of-truth document and verify each against the target, checking the plan-vs-design. Team lead validates findings and mitigates if need be.

**/build** — Opus leads, Sonnets build. Uses Claude Code's agent teams so each builder gets its own terminal. The lead never writes code, just coordinates and unblocks, and runs **/pmatch** checks the implementation against the plan after the team shuts down.

Post-build pipeline — **/denoise** strips dead code and noise, **/qf** and **/qb** audit against project-specific style guides, **/qd** validates documentation freshness, **/security-review** scans for OWASP vulnerabilities. Run them as an ordered pipeline or swarm them in parallel against independent paths.

This is how I ship.

**Key principles that emerged from iteration:**

\- **Context is noise**. Bigger token windows are a trap. Give agents only the narrow, curated signal they need for their specific phase. Less context = higher IQ.

\- **Cognitive tiering.** Opus for strategy and design. Sonnet for implementation. Haiku for proxy agents that shuttle prompts to external models.

\- **Audit the auditor.** The agent that builds the code cannot validate it. Separate contexts for execution and validation.

\- **Stress-test assumptions.** An idea is only as good as the number of bulletholes it can withstand. Have distinct models critique the same design, exposing blind spots that a single perspective would miss

\- **Grounding, not guessing**. Before recommending a library or pattern, the system verifies against live documentation, project docs, and known pitfalls. Documented reality overrides training data.

\- **Deterministic execution**. If the builder has to guess, the planner failed. Test cases defined at plan time, not after the build.

**Agency > Automation**

The entire system is designed around preserving **intent and agency** against the grain of automated gas-lighting and cognitive offloading. I don't want a magic button, I just want to know what happens when I can finally work at the speed of thought.

Packaging it up for public release soonish. Happy to answer questions about any of the pieces.

Clarification: some folks seem to have mistaken what is a collection of CC primitives + a script, solidified as second order effect of a years worth of development, for a standalone application it took 3k hours to build. The UI in the screenshot is in actual fact the new native agent teams UI in CC, for those of you who didnt know. Guess I should have been clearer somehow; so deep in I forgot to spoonfeed lol. Been so damned confused wtf people thought anyone would spend a year on a collection of skills.