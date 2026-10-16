# The public mirror

Written 2026-10-08. This repository is private and is where the work happens. A second repository, `rafael-sanchezf/verso`, is public and is a snapshot of the parts of this one that are meant to be read: the code, the design docs, the research, the roadmap. It is refreshed by a GitHub Actions workflow once a day (on every push to `main` until 2026-10-14, decision 40), and nothing reaches it without passing a gate. The public repo is for reading, not running: nothing deploys from it, and its history starts at the first sync.

## What syncs

Every decision is a path, never a line inside a file; that is what keeps the sync mechanical. The rules are in [`scripts/publish/rules.txt`](../../scripts/publish/rules.txt), in three sections:

- **`[deny]`**, checked first: `docs/private/`, the Claude and Codex settings folders, this tooling, and the site's cover art. A path that matches a deny line never leaves.
- **`[allow]`**: `apps/`, `packages/`, `supabase/`, `docs/`, the root Markdown files (`README.md`, `ARCHITECTURE.md`, `AGENTS.md`, `CLAUDE.md`, `ROADMAP.md`), the workspace files the public CI needs (`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.npmrc`, `.gitignore`, `.env.example`, `vercel.json`), and exactly one workflow, `ci.yml`. A path that matches nothing stays private.
- **`[terms]`**: the words and identifiers that must not appear anywhere in the export.

[`scripts/publish/export.sh`](../../scripts/publish/export.sh) builds the tree from `HEAD` (never from the working copy), applies the rules, then runs the gate: the term list as a whole-word, case-insensitive grep over every text file, and gitleaks over the tree. [`.github/workflows/public-sync.yml`](../../.github/workflows/public-sync.yml) runs it daily at 15:00 UTC and on manual dispatch, and on a clean gate pushes the tree to the public repo's `main` as one commit, `Sync from <short sha>`, authored as the no-reply identity. The commit message never carries the private commit's subject. The push uses the repository secret `PUBLIC_SYNC_TOKEN`, a fine-grained token scoped to the public repo only, contents read and write; the workflow's own token stays read-only.

The sync never edits prose. If a line has to change to be public, it changes here, in the private repo, and the next push carries it.

## What never syncs

- `docs/private/`: the venture side, pricing, milestones and the dated log, the dogfooding notes, the agent build plans and Figma drawing kit, the HIG reviews, the logo work, the reference screenshots of other apps, and `CONTEXT.md`, which carries the identifiers the public docs show as placeholders (`<project-ref>`, `<figma-file-key>`, `<team-id>`, `<device-id>`).
- `.claude/`, `.codex/`, and the per-package `.claude/` folders.
- Every workflow except `ci.yml`: the scheduled jobs read secrets, and the public repo has none. `ci.yml` runs on the local Supabase stack and needs no secret, so the public badge is green on its own.
- `scripts/`, including this tooling and the term list, which names the very things it keeps out.
- `apps/site/public/art/`: cover art and posters belong to their publishers and studios; the site serves them, the repo does not redistribute them.
- Anything untracked or uncommitted: the export reads `HEAD`.

## How to add a path

1. Put the file where its kind already lives. New code under `apps/` or `packages/`, new prose under `docs/`, anything personal, venture, pricing, class or career under `docs/private/`. A new top-level folder or a new workflow is private until it is listed.
2. If it should be public and matches no allow line, add one line to `[allow]` in `rules.txt`, with a comment saying what it is.
3. Run the dry run and read the gate result and the file list before pushing:

```bash
scripts/publish/export.sh --dry-run
```

4. If a word in the new file is one the gate must learn to ignore (a product term that collides with the list), reword the sentence here rather than touching the list; the list changes only when a term keeps false-positiving on product content, or when a new leak pattern appears.

## What to do when the gate flags

The job fails and its summary lists every hit with the file and line; nothing was pushed, and the public repo still shows the previous sync. Then:

1. Read each hit. A real leak (a name, a school, a price, an identifier) moves to `docs/private/` or is reworded; the dry run above confirms the fix before the next push.
2. A false positive on product content (a verb that collides with a term on the list, a company's investor-relations page) is reworded in the private repo when that is a one-word change, and otherwise the term is narrowed in `rules.txt` with a comment saying why.
3. Push to `main` again. The next sync runs on its own; `gh workflow run public-sync.yml` runs it by hand.

The gate is a safety net, not the rule. The rule is the first line of `CLAUDE.md`: anything personal, venture, pricing, class or career goes under `docs/private/`, which never leaves this repo.
