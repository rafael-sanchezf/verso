# The board

How the work on Verso is tracked, written 2026-10-09. Rafa runs the project as its product manager on a Jira board; Claude, as sessions and agents that come and go, is the team. This document is the operating rules. The design they came from, with the reasoning and the setup steps, is the private brief.

## What the board holds, and what it does not

The board says what is being done, by whom, in what state, and what waits on Rafa. It does not hold scope, design, or reasons. A card says what, who, state and when; it links to the document that says why and how.

| On the board | In the repo |
|---|---|
| State, assignee, order, dates, estimates | Scope and the version plan (`ROADMAP.md`) |
| Rafa's to-do list and the open questions for him | Decisions as a numbered record, with the why (`ROADMAP.md`, Decisions) |
| Follow-ups noticed in passing | Feature ideas with sketches and open questions (`docs/feature-ideas.md`) |
| What shipped, as a comment on the card | How it is designed (`docs/design/`) and how the repo is run (`docs/process/`) |
| Bugs found on the phone | Nothing new: the older dogfooding lists are frozen and point here |

The roadmap's work queue stopped growing when the board started; its numbers stay valid for citations. A multi-PR build is still designed in its build plan, and each wave of it is an Epic whose description links the plan.

## The project

One team-managed Kanban project, key `VER`, with two people on it: Rafa, and an account named Claude that every session writes through, so every comment and every move made by a session is signed Claude.

### Issue types

| Type | What it is | Who files it |
|---|---|---|
| Epic | A feature or a build wave. Links its brief. | Claude from the roadmap and the build plans; Rafa for a new feature |
| Story | One user-facing increment with acceptance criteria, usually one PR. | Rafa, or Claude decoding what Rafa said |
| Task | Work with no user face: a migration, a mirror, CI, a script, a research note, a doc. | Mostly Claude |
| Bug | Something wrong on a screen or in the data. | Rafa from his phone, Claude from tests |
| Decision | A question only Rafa can answer: the options, a default, what waits on it, a due date. | Claude, whenever a session would otherwise guess |
| Sub-task | A slice of a story, or an item for Rafa hanging off a card, such as a PR to review. | Claude |

A Decision that passes its due date resolves to its default, and the card says so when it closes. Closing a Decision writes a numbered decision into the roadmap. Until the project has the Decision type, a Decision is a Task with the label `decision`.

### Statuses

| Status | Meaning | Who moves a card in | It leaves when |
|---|---|---|---|
| Backlog | Captured, not refined. Not on the board. | Anyone | Rafa pulls it forward, or Claude asks |
| Refining | Claude is writing the approach, the estimate, the risks and the questions as a comment. | Rafa by pulling, or Claude | The refinement comment exists |
| Ready | Rafa has read the refinement and approved it. The order of the column is the priority. | Rafa only | Claude takes the top card |
| In progress | A session or agent is on it, in a worktree. | Claude | A PR is open with CI green |
| In review | The PR is open and waits on Rafa's review of the diff, or on a hosted step only he can run. | Claude, when the PR opens | Rafa merges |
| Done | Merged, hosted steps run, docs updated, the card commented with what shipped. | The merge automation, or Claude for work with no PR | |

Any status can move to any other; a card that goes back from In review to In progress after a review comment is normal. Blocked is not a status. A blocked card gets Jira's flag and a linked Decision or Rafa item, so whatever unblocks it is itself a card in someone's lane. A card closed without doing gets one line saying why.

### Assignee and labels

The assignee is the signal. A card assigned to Rafa is his to act on; a card assigned to Claude is Claude's to build; unassigned means Backlog. The board is grouped by assignee, so Rafa's lane is at the top and is the only part he has to read.

Six labels say what kind of action an item in Rafa's lane is, and there are no more without editing this document.

| Label | Rafa's action | Typical minutes |
|---|---|---|
| `review` | Read a PR's diff, then merge or comment | 5 to 15 |
| `decide` | Answer a Decision, or let its default stand | 2 to 10 |
| `run` | Run a hosted command a session is not allowed to run | 2 to 5 |
| `figma` | React to drawn frames | 10 to 30 |
| `words` | Supply or approve copy in his own words | 10 to 30 |
| `phone` | Test a build on his phone and report | 10 to 20 |

One more label marks provenance: `from-rafa` on any story he wrote himself. It tells a session the card carries his literal intent, so its refinement decodes the words and asks before reshaping anything.

The summary of every item in Rafa's lane is a verb, an object and the minutes it takes: "Review PR #84: suggest on the new model (10 min)", "Decide: TV ranking unit, default season (5 min)", "Run: db push for the new migration (2 min)". He should be able to clear the lane from his phone without opening a card.

### Fields

- **Release** is the milestone. There is one release per milestone plus `Later`; the roadmap's versions are scope rather than dates, so they are not repeated as releases, and an Epic's description names its version.
- **Epic** is the feature. Nearly every story, task and bug has one; a one-off chore may not.
- **Component** is the area of the codebase: `games`, `movies`, `catalog`, `database`, `app shell`, `web`, `site`, `infra`, `design`, `research`, `docs`.
- **Priority** is Jira's five levels. Rafa sets it and Claude never changes it. Inside Ready the column order wins over the field.
- **Original estimate** is in hours, set by Claude in refinement. There are no story points.
- **Due date** is set on Rafa's items and on Decisions only.
- **Links** go to the brief, the build plan, the Figma frame and the PR. The GitHub app fills the Development panel; documents are web links on the card.

### The board and the saved filters

The board is grouped by assignee, with column limits of ten on Ready and four on In progress. Rafa's lane has a cap of five, which Jira cannot enforce because it limits columns and not lanes, so the end-of-session protocol enforces it.

The saved filters, which are also the dashboard's gadgets:

| Filter | JQL, or what it holds |
|---|---|
| `Mine` | `assignee = currentUser() AND statusCategory != Done ORDER BY duedate, priority DESC` |
| `Needs me this week` | `Mine` with `duedate <= endOfWeek()` |
| `In flight` | `status in ("In progress", "In review") ORDER BY updated DESC` |
| `Ready` | `status = Ready ORDER BY Rank` |
| `Stale` | `status in ("In progress", "In review") AND updated <= -7d`, the sweep for a session that died |
| `Open decisions` | `issuetype = Decision AND statusCategory != Done ORDER BY duedate` |
| One per open release | The work left in that release |
| `This week` | Everything assigned and open that is due this week, in review or refining, or a decision |

### Templates

Every card of a type uses the same skeleton, so a reader, a person or a session, knows where to look.

**Story**

```
Problem: who is stuck and on what, in two sentences.
Acceptance criteria:
  - [ ] observable statement 1
  - [ ] observable statement 2
Non-goals: what this story does not do.
Links: brief, frame, spec.
Claude's refinement (added in Refining): approach, files touched, estimate, risks, Figma first or not, questions.
```

**Decision**

```
Question: one line.
Options: A (default), B, C, each with one line of consequence.
Waits on this: the cards or PRs blocked.
If unanswered by <due date>: the default is taken and recorded as the next numbered decision.
```

**An item for Rafa**

```
Summary: Verb: object (N min)
Body: the exact command, link, or question. Nothing else.
```

**Bug**: the steps, what was expected, what happened, the device, and where it was first noted.

## How the team works

### Roles

**Rafa, the product manager.** Owns the order of Ready and the scope of every story. Writes stories when he has their shape, or reacts in his own words and lets a session decode them. Decides, on cards, by their due dates. Reviews every diff before it merges. Runs the hosted commands sessions are not allowed to run. Reacts to Figma frames, tests on his phone, and supplies his own words for anything another person will read.

**Claude, the team.** Engineering, design drafts, research, data and docs. Refines every story before it is Ready and puts the refinement on the card, where the next session can read it. Builds from the top of Ready, in a worktree, behind a PR with CI green. Files its own follow-ups as cards. Files a Decision instead of deciding. Never reorders Ready, never changes a priority, never widens a story.

### The life of a story

1. **Intake.** Rafa says it, in Jira or in a chat. From a chat, the session files the card with the `from-rafa` label and the Story template, and lists every inference it made as a question in the refinement.
2. **Refining.** A session reads the code and the briefs and comments with the approach, the files, the estimate in hours, the risks, whether Figma comes first, and its questions. A question that is a decision becomes a Decision card linked to the story. The story moves to Refining and is assigned to Rafa for one read.
3. **Ready.** Rafa reads the comment and moves the card to Ready at the position he wants, or comments and sends it back, and assigns it to Claude. This is the one approval the process asks of him before building.
4. **Build.** A session takes the top card of Ready that fits its time, moves it to In progress, and works on a branch named `VER-123-short-name` in a worktree. If the card needs Figma, the drawing round runs first and a `figma` item lands in Rafa's lane.
5. **Review.** The PR title begins with `VER-123` and CI runs. The session moves the card to In review and files an item in Rafa's lane, "Review PR #N: title (M min)", with the merge order when several PRs relate. PRs are never stacked; each is based on `main`. A hosted step only Rafa can run becomes a `run` item with the exact command.
6. **Done.** Rafa merges, and the automation moves the card to Done. The session that merged, or the next one, comments with what shipped, the roadmap or doc lines it changed, and the decision number if there is one. The card is the record.

### Session protocols

These bind every session through `CLAUDE.md` and `AGENTS.md`.

At the start of every session, before anything else:

1. Read the week (`scripts/jira/jira week`) and what is in flight (`scripts/jira/jira inflight`).
2. Fetch, then reconcile In progress against `git log` and `git worktree list`, so a card with no live branch or a branch with no card is fixed before new work starts.
3. Report in at most five lines: what waits on Rafa, what is in flight, what is next.
4. Take the top Ready card, unless Rafa names another.

At the end of every session, before the last message:

1. Every card the session touched is in its true state, with its PR linked.
2. Everything Rafa must do is a card in his lane with a verb and minutes, or in Backlog assigned to him with no due date if his lane already holds five.
3. Anything noticed in passing is a one-line card in Backlog, unassigned, and not a paragraph in the chat.
4. The last message to Rafa is his lane: up to five items, ranked, one line each.

A session that dies leaves a card In progress with no update. The `Stale` filter catches it after seven days, and the start-of-session reconciliation catches it sooner. The next session reads the branch, decides whether to continue or close, and comments.

### Rituals

- **Weekly planning**, fifteen minutes, Sunday evening by default. Rafa reads the weekly brief, reorders Ready, closes what is stale, answers or defers Decisions, and names the week's cap for In progress if it is not four. Claude prepares; Rafa decides.
- **The weekly brief** is a comment on a standing `Weekly` task, written by a scheduled routine or by the first session of the week: what landed last week with PR numbers, what is in flight, what waits on Rafa with minutes, the open Decisions by due date, the current milestone's remaining count against its date, and one risk. Five lines a section at most.
- **A release check** at each milestone's halfway point and on its date, reading the release page together, with any scope cut or date change filed as a Decision.
- **No standups.** The start-of-session report is the standup.

### Definitions

**Ready** means the card has a problem and acceptance criteria; it has an Epic, a Component and a Release; Claude's refinement comment exists with an estimate and a Figma yes or no; every question raised in it is answered or is a Decision card with a default and a date; and Rafa moved it.

**Done** means the PR merged with CI green; the hosted steps were run by Rafa or filed as `run` items; the roadmap is updated if a decision was taken; the docs that describe the changed thing are updated; any new user table has Row Level Security and its policy test; and the card is commented with what shipped.

### Why the caps

Five visible items, ranked, is how Rafa wants to be talked to, and the board applies the same rule to his work. A lane of five means the review queue cannot grow to eight while he is away; the sixth review waits in Backlog and the session says one is held back. That is the signal that the team is producing faster than the product manager can absorb, which is the information worth having. In progress at four matches what one session can supervise with one integration pass on the simulator. Ready at ten is about three weeks of work; refinement past that goes stale before the card is reached.

A monthly sweep closes anything untouched in Backlog for sixty days, with one line why.

## Plumbing

**GitHub for Jira.** Atlassian's free app links the private working repository to the board. Any branch, commit or PR carrying `VER-<n>` shows on that card's Development panel with its CI status. Branches are `VER-123-short-name`, PR titles begin with `VER-123`, and commits need no key when the branch has one.

**One automation rule.** When a pull request is merged, the linked card moves to Done with the comment "Merged in" and the PR link. Every other move is made by the session that caused it, through the API, which keeps the project inside the plan's monthly budget of rule runs.

**Claude's access.** A REST API token on the Claude account, in `.env` as `JIRA_SITE`, `JIRA_EMAIL` and `JIRA_API_TOKEN` (the names are in `.env.example`), and never pasted into a chat. Every session and agent authenticates the same way, so parallel agents need no shared login. They all go through one small command line, `scripts/jira/jira`, which stays in the working repository: `week`, `mine`, `ready`, `inflight`, `stale` and `decisions` to read; `create`, `move` and `comment` to write; `ask` to file a Decision in Rafa's lane; `handoff` to file an item for him under a card; `setup` and `seed` to configure and fill the project.

**Atlassian's MCP server** is optional, for Rafa's own interactive sessions. It signs in as whoever consents in the browser, so its writes are his, which is right for his edits and wrong for Claude's; the protocols keep using the command line.
