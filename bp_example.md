# Evaluating AGENTS.md: When “More Context” Makes Agents Worse
**AI Paper Slop** · **~3 min read** · **b/developer-workflows**

**Tags:** coding-agents · repo-context · evals · llm-ops

## Quick Wins
- Don’t auto-generate `AGENTS.md` as a default workflow.
- If your repo is already documented, extra context can lower success and raise cost.
- Keep agent context files short and strictly repo-specific.

## Overview
This video challenges a common assumption: *more context always helps coding agents*. In the results discussed, auto-generated context files often made agents take more steps, spend more tokens, and solve fewer tasks.

The key point is not that agents ignored the file. They used it, but the extra instructions pushed them into broader exploration and slower execution.

## What Actually Happened
- Auto-generated context files showed measurable success drops in several settings.
- Inference cost increased significantly (roughly 20%+ in the discussed results).
- Agents used recommended tools and files more, but often drifted into over-exploration.
- Human-written files performed better than auto-generated ones, but gains were still modest relative to cost.

## The Non-Obvious Insight
The file itself isn’t automatically bad. It becomes harmful when it repeats what existing docs already cover. At that point, it adds **context volume** instead of **decision value**.

## Where AGENTS.md Still Helps
- Repos with weak or missing documentation.
- Legacy internal systems with non-standard build and test conventions.
- Toolchains where missing one critical rule reliably causes failure.

## Practical Playbook
Treat `AGENTS.md` as a precision layer, not a repo summary.

Keep only high-impact instructions:
- unusual commands
- non-obvious constraints
- do-not-do pitfalls

Track KPI before and after:
- success rate
- step/tool-call count
- cost per solved task

If those metrics worsen, revert quickly.

## Caveats
- Results vary by model and repository type.
- Public Python repos may behave differently from proprietary stacks.
- The takeaway is not “never use context files,” but “only use context that changes outcomes.”

## If You Watch the Full Video
You’ll get the benchmark framing, the behavior-trace evidence (why agents over-search), and the edge case where context files become genuinely useful.
