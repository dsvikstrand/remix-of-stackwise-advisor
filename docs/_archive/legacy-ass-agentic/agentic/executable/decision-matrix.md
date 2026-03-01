# Decision Matrix (`bleuV1`)

Purpose: freeze high-impact defaults so role agents do not invent policy.

## Product Identity Locks
1. Primary identity: source-first imported blueprints.
2. Community layer: insights/remixes on imported blueprints.
3. Standalone free-form post model: out of MVP scope.

## Runtime Defaults
1. Adapter scope: YouTube-only.
2. My Feed visibility: personal/private by default.
3. Promotion mode: selected/manual approve by default.
4. Low-confidence candidate action: block channel publish, keep in My Feed.
5. Channel publish requires passing all mandatory gates.

## Orchestration Defaults
1. Control plane: CLI-first (`codex exec`) + GitHub Actions.
2. Role order: Planner -> Implementer -> Evaluator -> Integrator.
3. Checkpoint policy: three mandatory stop-and-inspect checkpoints max per milestone.

## Authority Matrix
- Product owner (human):
  - can change identity, scope boundaries, checkpoint policy, and threshold class behavior.
- Planner agent:
  - can decompose work only within locked scope and defaults.
- Implementer agent:
  - can implement tasks that pass schema and interface constraints.
- Evaluator agent:
  - can block progression on failing gates/tests.
- Integrator agent:
  - can merge only when review-gates pass and no stop-checkpoint is pending.

## Override Rules
1. Any change to identity/scope defaults requires a documented decision update in:
   - `docs/app/product-spec.md`
   - `docs/architecture.md`
   - `docs/_archive/legacy-ass-agentic/agentic/executable/decision-matrix.md`
2. Any safety/PII threshold class change triggers stop-checkpoint 2.
3. Emergency overrides must include rollback note and owner in task artifact.

## Refusal Rules (Agents)
Agents must refuse or escalate when:
- task conflicts with locked defaults
- task attempts to bypass mandatory gates
- task omits acceptance tests or rollback notes where required
