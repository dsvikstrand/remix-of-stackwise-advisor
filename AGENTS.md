# Collaboration Guidelines

## Bullet keys for clarity
When you provide **Findings**, **Questions**, **Lists**, or any multi-item bullets, prefix **each item** with a **unique key**. (OBS you can use any "keys" as bullets (*, -, ints. etc), not limited to
"
a1)... 
a2)...
"

Example:

Findings  
a1) ...  
a2) ...  

Questions  
b1) ...  
b2) ...  

Rules:
- Keys only need to be unique **within the current message**.
- Keys may be reused in later messages.


## Plan-first implementation
Process:
- First, provide a **high-level implementation plan** (steps + files/functions to touch).
- Then wait for my approval/adjustments.
- Only after I approve the plan should you write or modify code. 

## Plan approved
if I add PA (plan approved), you can go with code (don't need to wait for code ok here).
PAP (plan approved -> push to github), push the latest update once you are done (with a simple comment)

## Git push access in this environment
Push access depends on the SSH key stored in this environment. Any Codex session can push only if it runs in the same environment where the key and SSH config exist. This applies to any repo path opened in this environment (for example `/mnt/c/Users/Dell/Documents/VSC/App/newApp`). Removing the key disables push until a new key is added.

## UDO shortcut for execution
If a message ends with `UDO`, treat it as approval to execute the actions you propose without waiting for a separate confirmation. Always summarize what you did afterward. (Not for code, only for commands : PA/PAP is for code)

## Shortcuts
If I type REC -> "use/go with your recommendations"
for example: if you give me a follow up question:
(codex) - "Would you like option A or B?"/"How should I do X"
(me) - "REC" -> "Please use/go with your recommendations"

some other "shortcuts" are (these are not commands):
IMP -> Implement
SUCC -> Successful
SPC -> Specific
FQ -> Follow-Up questions
ST -> Smoke test
LL -> "Last Line" of Your message (usually a follow-up Question, where "LL yep" -> "Yes to your follow up" )


## Remote server: Oracle (SSH alias + multiplexing)

Use the SSH alias (no raw IPs/keys in commands).

[have] Node version baseline
- This repo expects Node 20+ (Supabase JS v2 requires Node >= 20).
- `.nvmrc` pins `20.20.0`.

[have] In this Codex environment, `oracle-free` is configured in `/root/.ssh/config` and uses:
- `IdentityFile /root/.ssh/id_ed25519_codex_agentic`
- SSH multiplexing (`ControlMaster auto`, `ControlPersist 10m`, `ControlPath ~/.ssh/oracle-%r@%h:%p`)

Server details
- Host alias: `oracle-free`
- Repo dir: `/home/ubuntu/remix-of-stackwise-advisor`

Where SSH files live
- This Codex environment: `/root/.ssh/`
- Oracle server (Ubuntu user): `/home/ubuntu/.ssh/` (not `C:\\Users\\Dell\\.ssh`)
- Your Windows machine (PowerShell ssh/scp): `C:\\Users\\Dell\\.ssh\\` (separate from Codex/server)

Sanity checks
- `ssh -o BatchMode=yes -o ConnectTimeout=10 oracle-free "echo ok"`
- `ssh oracle-free "cd /home/ubuntu/remix-of-stackwise-advisor && git status -sb"`

Node/tsx note (important)
- One-shot `ssh oracle-free "node -v"` may use the system Node (`/usr/bin/node`, often old). For seed scripts, force Node 20 via nvm:
  `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 20.20.0 >/dev/null; node -v`

Preferred patterns
- One-shot: `ssh oracle-free "cd /home/ubuntu/remix-of-stackwise-advisor && git pull --ff-only"`
- Seed runner: `ssh oracle-free 'export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 20.20.0 >/dev/null; cd /home/ubuntu/remix-of-stackwise-advisor && TMPDIR=/tmp npx -y tsx ./codex/skills/seed-blueprints/scripts/seed_stage0.ts --help'`
- SCP: `scp localfile oracle-free:/home/ubuntu/remix-of-stackwise-advisor/`

Troubleshooting
- If you see `Permission denied (publickey)`: confirm the key path and that `/root/.ssh/id_ed25519_codex_agentic` exists in this environment, and that the public key is in `~/.ssh/authorized_keys` on the server.
- First connect may prompt to accept the host key; answer `yes` once.

## [have]/[todo] status tags

Use `[have]` and `[todo]` at the start of bullet items when describing project state, plans, and reviews (especially for ASS/DAS work).

Definitions
- `[have]`: implemented and verified (or explicitly confirmed working).
- `[todo]`: missing, not implemented yet, or not verified.

How to use in messages
- Before a multi-step plan: include a short `Status` section with a mix of `[have]` and `[todo]`.
- For execution plans: tag each step as `[todo]` unless it is already done (`[have]`).
- For reviews: tag each finding as `[todo]` and call out if it is blocking vs non-blocking.

Example format
```
Status
a1) [have] Stage 0 runner produces artifacts under seed/outputs/<run_id>/
a2) [todo] Add real quality eval gates (relevance/safety/pii) for LIB_GEN

Next steps
b1) [todo] Implement the LIB_GEN eval gate + retry wiring
b2) [todo] Run a DAS smoke test and link the run_log.json
```

## Effort Flags (Soft)

Use effort flags to control how much exploration/tooling depth I use during planning and implementation.

How to use
- Add one flag to your request: `[low]`, `[med]`, or `[high]`.
- Example: `Plan [low]`, `Review [high]`, `Implement [med]`.

Meaning (soft limits, not hard stops)
- `[low]`: minimal exploration; smallest viable change; prefer 1-2 smoke tests.
- `[med]`: normal; enough exploration to be confident; a couple of focused smoke tests.
- `[high]`: deeper investigation; more file reads and cross-checks; broader smoke tests as needed.

Important
- These flags do not change which GUI/model tier you are using. They only change my behavior and how much I explore.

## Final GUI reasoning effort recommendation
When you give me a full implementation plan (effort flags included). Also give me a finial REC for the GUI/MODEL REASONING to use. one of-> |Low,Med,High,xHigh|

## Build Check Policy (Credit-Saving)

Default intent
- Keep command usage low for small tasks.
- Do not run full build automatically for every tiny edit.

Recommended behavior
- For `PA`: skip `npm run build` by default unless change-risk is medium/high.
- For `PAP`: run `npm run build` before push by default.
- For small copy/style/localized edits: prefer no build (or a lighter check if needed).
- Run full build when changes touch:
  - routing/navigation
  - shared components/layout primitives
  - type-heavy refactors
  - publish/auth/data flow paths

## Docs Governance (Canonical + Status Registry)

Canonical entrypoints
- Root onboarding: `README.md`
- Docs entrypoint: `docs/README.md`
- System architecture: `docs/architecture.md`
- Product behavior: `docs/app/product-spec.md`
- Plan registry: `docs/exec-plans/index.md`

Rules
- Do not reintroduce moved/deprecated stub docs.
- Keep active/completed status index-driven in `docs/exec-plans/index.md`.
- Keep only active work in `docs/exec-plans/active/`; move finished plans to `docs/exec-plans/completed/`.
- When relevant code changes land, run docs freshness/link checks and update mapped docs.

Docs maintenance shortcut
- `UDOC` -> run docs consolidation pass:
  - sync canonical docs with recent repo changes
  - update active/completed registry in `docs/exec-plans/index.md`
  - remove deprecated docs/stubs if found
  - run `npm run docs:refresh-check -- --json` and `npm run docs:link-check`
