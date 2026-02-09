# Daily workflow (lovable-updates only)

## Inputs
- A list of 1-3 unified diff patches (from Lovable chat output).
- Policy and invariants in `.lovable/plan.md`.

## Commands (preferred)

1) Sync branch

```bash
cd /mnt/c/Users/Dell/Documents/VSC/App/bleu/bleu
git checkout lovable-updates
git fetch upstream
git pull --ff-only upstream lovable-updates
```

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
