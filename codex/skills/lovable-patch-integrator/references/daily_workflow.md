# Daily workflow (lovable-updates only)

## Inputs
- A list of 1-3 unified diff patches (from Lovable chat output).
- Policy and invariants in `.lovable/plan.md`.

## Keep The Skill Docs Current (important)

This workflow runs on branch `lovable-updates`, but the newest version of this skill may be committed on `upstream/main` first.

Always do:

```bash
cd /mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu-lovable
git fetch upstream
git pull --ff-only upstream lovable-updates
```

Hard guardrail (do this every time):

```bash
cd /mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu-lovable
test "$(git branch --show-current)" = "lovable-updates" || (echo "ERROR: not on lovable-updates" && exit 1)
```

If you want to see whether the skill docs changed on `upstream/main`:

```bash
git fetch upstream main
git log --oneline --decorate -5 upstream/main -- codex/skills/lovable-patch-integrator/SKILL.md
```

To read the newest skill text from `upstream/main` without switching branches:

```bash
git show upstream/main:codex/skills/lovable-patch-integrator/SKILL.md | sed -n '1,200p'
```

## Commands (preferred)

1) Sync branch

Preferred: run this workflow inside the dedicated Lovable worktree folder:

`/mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu-lovable`

```bash
cd /mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu-lovable
git branch --show-current
git fetch upstream
git pull --ff-only upstream lovable-updates
```

If `git branch --show-current` is not `lovable-updates`, stop and fix the folder/branch before applying patches.

2) Apply one patch

- Save the patch text to a local file, e.g. `./tmp_lovable.patch`.
- Apply:

```bash
git apply --whitespace=nowarn ./tmp_lovable.patch
```

If it fails, see "Conflicts".

3) Build gate

```bash
npm run build
```

4) Commit

```bash
git status -sb
git commit -am "Lovable patch: <short topic>"
```

If the patch adds new files, use:

```bash
git add -A
git commit -m "Lovable patch: <short topic>"
```

5) Repeat step 2-4 for each patch in today's batch.

6) Push lovable-updates

```bash
git push upstream lovable-updates
```

## Conflicts

Lovable patches are applied with `git apply`, so conflicts show up as a failed apply.

Preferred recovery:
- Stop and ask Lovable to regenerate the patch against the latest `main`.

If the patch is small and obvious:
- Manually implement the equivalent change.
- Keep the scope identical.
- Note in the commit message: `manual-apply`.

## Never do
- Do not merge to `main` as part of this workflow.
- Do not commit any `.local` token files.
