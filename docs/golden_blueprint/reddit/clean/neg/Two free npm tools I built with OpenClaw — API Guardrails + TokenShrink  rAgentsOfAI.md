Hey everyone — wanted to share two tools I've been working on, both built alongside my OpenClaw-powered agent ecosystem. Sharing here since this community gets the AI tooling space.

**API** **Guardrails** — Express/Fastify middleware that adds rate limiting, input validation, cost tracking, and abuse prevention to any AI API endpoint. If you're exposing LLM endpoints (even internally), this drops in with one line and handles the stuff you don't want to build yourself: token budget enforcement, per-key rate limits, request size guards, and cost logging. Zero config needed — sensible defaults out of the box, override what you want.

**TokenShrink** — Token-aware prompt compression. v2.0 just shipped with a complete rewrite after [r/LocalLLaMA](https://www.reddit.com/r/LocalLLaMA/) correctly pointed out that BPE tokenizers don't map 1:1 with words. "database" is already 1 token — replacing it with "db" (also 1 token) saves nothing. v2.0 verifies every replacement against cl100k\_base so it never increases your token count.

Benchmarked at 12-15% real savings on verbose system prompts. Zero dependencies, works with any LLM.

Both are MIT licensed, free forever, no sign-up. Search "api-guardrails" or "tokenshrink" on npm.

They pair well together — TokenShrink compresses your prompts before they hit the API, and API Guardrails protects the endpoint itself. Running both in my own multi-agent setup managed through OpenClaw.

Happy to answer questions about either one or how they fit into an agent workflow.
