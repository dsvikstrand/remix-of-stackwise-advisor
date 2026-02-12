# Collaboration Guidelines

## 1) Bullet keys for clarity
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

## 2) Budgets (Soft)

Goal: keep weekly rate-limit spend low by default, without blocking task completion.

Defaults: see section 13 (Effort Flags (Soft)) for details.
- Use minimal exploration and minimal commands needed to make measurable progress.
- Budgets are **soft**, not hard limits. If a task needs more work than the budget, finish the task after doing the escalation step below.

Soft budgets Recommendation (Soft Limit per task)
- `commands`: ~10
- `file reads/greps`: ~10
- `smoke tests`: ~2


## 3) Plan-first implementation
Process:
- First, provide a **high-level implementation plan** (steps + files/functions to touch).
- Then wait for my approval/adjustments.
- Only after I approve the plan should you write or modify code. 

## 4) Plan approved
if I add PA (plan approved), you can go with code (don't need to wait for code ok here).
PAP (plan approved -> push to github), push the latest update once you are done (with a simple comment)

## 5) Lovable tickets workflow 
When we have a new Lovable task, add a new numbered markdown file in `lovable/tickets` (e.g., `1.md`, `2.md`, ...). Do not create templates. When a ticket is solved, admin will add a `_solved` suffix to the filename.

## 6) Git push access in this environment
Push access depends on the SSH key stored in this environment. Any Codex session can push only if it runs in the same environment where the key and SSH config exist. This applies to any repo path opened in this environment (for example `/mnt/c/Users/Dell/Documents/VSC/App/newApp`). Removing the key disables push until a new key is added.

## 7) UDO shortcut for execution
If a message ends with `UDO`, treat it as approval to execute the actions you propose without waiting for a separate confirmation. Always summarize what you did afterward. (Not for code, only for commands : PA/PAP is for code)

## 8) Document Tag Updates

Use document tags from `docs/README.md` to keep planning docs in sync.

How it works
- If you say: `update documents [TAG]`
- I will update only the planning docs that are labeled with that `[TAG]` in `docs/README.md`.

Rules
- `docs/README.md` is the source of truth for valid tags and which files carry each tag.
- I can suggest updates and new documents to add.
- I will use the documents to keep the work well structured and focused.

## 9) REC (go with your recommendations)
If I type REC -> "use/go with your recommendations"
for example: if you give me a follow up question:
(codex) - "Would you like option A or B?"/"How should I do X"
(me) - "REC" -> "Please use/go with your recommendations"

some other "shortcuts" are (these are not commands but simple placeholder for specific words):
IMP -> Implement
SUCC -> successful
FQ -> Follow-Up questions
ST -> Smoke test


## 10) Remote server: Oracle (SSH alias + multiplexing)

Use the SSH alias (no raw IPs/keys in commands).

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

## 11) [have]/[todo] status tags

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

## 12) Mermaid (.mmd) rendering gotchas

m1) Keep node and edge labels ASCII-only. Avoid unicode symbols (example: `✔`) and emojis.
m2) Avoid `<` and `>` in labels (example: use `PERSONA_ID` instead of `<id>`).
m3) Avoid multiline labels and escape tricks. Keep labels single-line.
m4) Prefer quoted labels for punctuation: `NODE_ID["text here"]` instead of `NODE_ID[text here]`.
m5) Keep node ids simple: letters/numbers/underscores only (put extra info in the label).
m6) For note nodes (`NOTE{{...}}`), keep note text short and ASCII.
m7) Debug method: if rendering breaks, remove or comment the last edits until it renders, then add text back incrementally.

How to use this in msgs
m8) If you hit a Mermaid parse error, paste the error line number and snippet. I will rewrite the offending labels to the safe subset above.

## 13) Effort Flags (Soft)

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

## 14) FInal GUI reasoning effort recommendation
When you give me a full implementation plan (effort flags included). Also give me a finial REC for the GUI/MODEL REASONING to use. one of-> |Low,Med,High,xHigh|

## 15) VS Code Plan Mode approval mapping

When using VS Code Plan Mode:
- I can include multiple follow-up questions (as many as needed) before implementation.
- If you press the VS Code button `Implement the plan`, treat it as full execution approval equivalent to:
  - `follow this plan please. PAP/UDO (respect effort flags and some test if needed UDO)`

Execution behavior after `Implement the plan`:
- Code changes are approved.
- Command execution is approved.
- Run focused smoke tests as needed (respecting effort flags).
- Push to GitHub when appropriate for `PAP` behavior.
