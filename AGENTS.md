# iReport Admin Agent Instructions

## Branch-first workflow

- Treat `main` as the protected integration branch. Do not make feature or redesign edits directly on `main`.
- Before editing, verify the worktree is clean and create or switch to a task branch from the latest `main`:
  `git switch main`, `git pull --ff-only`, then `git switch -c codex/<short-task-name>`.
- Push task work to its branch first (`git push -u origin codex/<short-task-name>`). Merge to `main` only after the build and tests pass and the change has been reviewed.
- Never use `git reset --hard`, force-push, or delete branches unless the user explicitly requests it.
- Before committing, inspect `git diff --stat`, `git status`, and staged file names. Do not commit `.env` files, credentials, service-role keys, or generated secrets.
- If the user explicitly asks to commit everything, call out broad changes, migration moves/deletions, and the exact commit scope before committing.

## Verification before push

Run from `C:\Projects\ireport-admin`:

```powershell
npm run build
npm test -- --run
git diff --check
```

Keep the working tree clean after committing and verify the branch is synchronized with its remote after pushing.

## Project scope

This is the Electron admin dashboard. Main process code lives in `src/main/`, preload APIs in `src/preload/`, and the React UI in `src/renderer/`. Preserve unrelated user changes in this intentionally multi-feature workspace.
