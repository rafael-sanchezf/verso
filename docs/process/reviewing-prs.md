# Reviewing pull requests

How to review a PR the way it is done on a working engineering team, sized for this project. Written 2026-09-15 with the first three PRs as examples.

## What a review is for

A review answers three questions: does this change do what it says, is it safe to merge, and will the next person understand it. It is not a line-by-line proofread. Most of the value comes from reading the description, deciding where the risk is, and spending your minutes there.

## The order of operations

1. **Read the description before any code.** What problem, what approach, how it was tested, what the reviewer must do afterward (secrets to add, commands to run). If the description does not say how it was tested, that is your first comment.
2. **Look at the file list, not the diff.** Sort files into buckets: schema migrations, CI and workflows, application logic, tests, config, docs, lockfile. Decide the risk order before opening anything. On this project the order is migrations, then workflows that touch secrets or production, then core logic, then tests, then docs. Lockfiles get a glance for unexpected new dependencies and nothing more.
3. **Check what CI actually ran.** Green is only meaningful if the job that matters exists. A PR that adds a migration is not verified by a CI that only runs the TypeScript unit tests.
4. **Read the risky files first, slowly.** For each one, ask: what happens when this fails (network down, empty result, duplicate row)? Can it be rolled back? Does it print or store a secret? Does it do more than the description claims?
5. **Read the tests as a reviewer, not a passenger.** Do the assertions test behavior, or do they restate the implementation? Is the business rule tested at its edges (the day a game becomes "old," the batch that is exactly 500 rows)? A test file that only checks the happy path is a request for one more test, not a block.
6. **Skim the rest.** Application code you have already seen tested, docs, and config get a fast read for naming, dead code, and scope creep.
7. **Run it when it is cheap.** A dry run, a single test file, or opening the app. Ten minutes of running beats an hour of reading for anything that touches data.
8. **Write the review.** Then merge or hand it back.

## How to write comments

- Lead with the blocking issues, if any, and say they are blocking. Correctness, data loss, and secret exposure block. Style never blocks.
- Prefix small things with "nit:" so the author knows they are optional.
- Ask questions instead of issuing orders when you are not sure: "What happens if IGDB returns the same game twice in one page?" is better than "handle duplicates."
- Approve with comments when the remaining points are non-blocking. Request changes only when something must change before merge.
- One PR should be one idea. A PR that does three things gets the comment "please split this" on a real team. On a solo project you can accept it, but you should know it is a concession.

## Mechanics on GitHub

- The Files changed tab is the review surface. Use the Viewed checkbox per file to track progress. Collapse the lockfile. Turn on "hide whitespace" for reformatted files.
- The Commits tab lets you read a large PR one commit at a time, which is often easier than the flattened diff.
- Click a line number to comment on that line. "Start a review" batches comments so the author gets one notification. Submit as Comment, Approve, or Request changes.
- Suggested changes let you propose an exact edit the author applies with one click.
- From a terminal, `gh pr diff <n>` shows the diff, `gh pr checkout <n>` puts the branch on your machine to run it, `gh pr checks <n>` shows CI, `gh pr review <n> --approve` or `--request-changes -b "..."` submits.

## Merging

- Squash merge on this project. One commit per PR on main keeps history readable and makes reverts one click.
- Delete the branch on merge.
- Merge in dependency order. If PR A adds a CI job that PR B needs, merge A first, then rerun or rebase B so its CI reflects the new job.
- After merging anything with a migration, confirm it is applied to the hosted project (`supabase db push`) or was applied already, and note it on the PR.

## Worked examples: the first three PRs

**PR 2, naming shortlist (80 lines, docs only).** Risk: none. Read the doc for content, check the links resolve, check the roadmap edit is the one line it claims. Five minutes. Approve and merge.

**PR 1, CI and keep-alive (114 lines, two workflows).** Risk: workflows run with repository permissions and read a secret. Check `permissions:` is read-only, the secret is passed through `env` and never echoed, the job has a timeout, and the failure mode without the secret is a clear message rather than a hang. Check the db job proves it applied the migration (the log line in the run). Then confirm the PR's own CI run shows the new job green. Merge this first, because PR 3 needs the db job to exist on main.

**PR 3, catalog mirror (2,022 lines).** This is at the upper limit of what one review should carry; on a team you would ask for it split into the package, the migration, and the workflow. Since it is verified, review it in risk order:

1. `supabase/migrations/20260915000000_catalog_indexes.sql`. A unique index on an expression. Ask: can it fail on existing data (no, the table was empty), does it lock a large table (69k rows, trivial), does it block future media types (the comment explains nulls do not collide). The pgTAP file asserts the index exists.
2. `.github/workflows/catalog-sync.yml`. Secrets through `env`, a concurrency group so two runs cannot overlap, a timeout, and a documented secret list. Ask: what does the workflow do with a bad secret (fails fast at the token request).
3. `packages/catalog/src/trim.ts`. This is the business rule. Compare it to the roadmap and the research: main games and remakes (since 2026-10-12, see `docs/design/igdb-setup.md`), has a cover, rated at least once or released within two years. It is one function used in two places, which is the right shape. Check the tests hit the boundaries: exactly one rating, exactly 730 days.
4. `packages/catalog/src/db.ts`. Two upserts inside one transaction per batch, so a failed page leaves nothing half-written. Ask: are rows ever deleted (no, the mirror only adds and updates, which is fine and worth knowing).
5. `igdb.ts` and `rate-limit.ts`. Ask how a 429 is handled (backoff and retry) and what stops an infinite retry loop.
6. Tests, then docs, then the lockfile (two new dependencies, `pg` and `tsx`, both expected).

Evidence a reviewer wants to see is on the PR itself: the unit test count, the local pgTAP result after the Docker incident, and the hosted import numbers. When that evidence is missing, ask for it before reading code.

## Time budget

Docs PR: five minutes. Workflow or config PR: fifteen. A code PR under 500 lines: thirty. Anything larger: ask whether it can be split, then budget an hour and read in risk order so the important part is done even if you stop early.
