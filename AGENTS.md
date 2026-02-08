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

## 2) Code gating with flags
I will control whether you write code using these flags:

- **(no code)**: Do not implement or output new code. Only discuss, explain, review, or ask/answer questions.
- **(code ok)**: Code is allowed.

If a message includes **(no code)**, wait until I explicitly send **(code ok)** before you start implementing.

## 3) Plan-first implementation
Process:
- First, provide a **high-level implementation plan** (steps + files/functions to touch).
- Then wait for my approval/adjustments.
- Only after I approve the plan should you write or modify code. 

## 4) Plan approved
if I add PA (plan approved), you can go with code (don't need to wait for code ok here)
PAP (plan approved -> push to github), push the latest update once you are done (with a simple comment)

## 5) Lovable tickets workflow
When we have a new Lovable task, add a new numbered markdown file in `lovable/tickets` (e.g., `1.md`, `2.md`, ...). Do not create templates. When a ticket is solved, admin will add a `_solved` suffix to the filename.

## 6) Git push access in this environment
Push access depends on the SSH key stored in this environment. Any Codex session can push only if it runs in the same environment where the key and SSH config exist. This applies to any repo path opened in this environment (for example `/mnt/c/Users/Dell/Documents/VSC/App/newApp`). Removing the key disables push until a new key is added.

## 7) UDO shortcut for execution
If a message ends with `UDO`, treat it as approval to execute the actions you propose without waiting for a separate confirmation. Always summarize what you did afterward. (Not for code, only for commands : PA/PAP is for code)

## 8) Branch + Pages mapping (Deprecated, we only use main now)
- `main` is the agentic backend branch and deploys to the root URL.
- `lovable-main` is the legacy Lovable branch and deploys to `/lovable-backend/`.
- `main-pre-agentic` keeps a backup pointer to the old main before the swap.

## 9) AI credits bypass (dev only)
Set `AI_CREDITS_BYPASS=true` in the backend environment to bypass credit limits while building/testing. Keep it off in production.

## 10) REC (go with your recommendations)
If I type REC -> "use/go with your recommendations"
for example: if you give me a follow up question:
(codex) - "Would you like option A or B?"/"How should I do X"
(me) - "REC" -> "Please use/go with your recommendations"


## 11) Remote server: Oracle (SSH alias + multiplexing)

We work against an Oracle Ubuntu box via SSH. Use the SSH host alias (no raw IPs / key paths in commands):

- SSH host alias: `oracle-free`
- Repo dir on server: `/home/ubuntu/remix-of-stackwise-advisor`

### Connection multiplexing (already configured)
SSH multiplexing is enabled in `~/.ssh/config` for `oracle-free` (ControlMaster/ControlPersist), so multiple sequential `ssh oracle-free "..."`
calls should be fast (reuses the connection).

### Preferred command patterns

**One-shot remote command**
```bash
ssh oracle-free "cd /home/ubuntu/remix-of-stackwise-advisor && git pull"
```
