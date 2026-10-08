# Repository Guidelines

`feeds-fetcher` is a GitHub Action (`llun/feeds`) that reads an OPML file of RSS/Atom feeds, fetches the entries, and builds a static Next.js feed-reader site that it publishes to a separate branch (default `contents`). See `readme.md` for user-facing behavior.

## Project Layout

- `action.yml` / `action.mjs`: action metadata (Node 24) and the entry wrapper. When `GITHUB_ACTION` is `llunfeeds` or `__llun_feeds`, it installs corepack, dependencies and Playwright Chromium, then runs `index.ts`. `.nvmrc` pins Node 24.
- `index.ts`: pipeline: `setup`, handle OPML issues, create feed database and files, `buildSite`, `publish`.
- `action/`: action logic: `repository.ts` (git setup, site build, publish), `issue.ts` (OPML-update issues), `feeds/` (fetching, RSS/Atom parsing, sanitizing, media, Hacker News, database/file storage).
- `app/`: Next.js App Router pages (`page.tsx`, `opml/`, layout, global CSS).
- `lib/`: shared code for the site and the action: OPML and feed URL helpers, Atom feed manifest, `storage/` (file and sqlite), `components/` (React UI), `reducers/`, `fixtures/`.
- `scripts/`: helper scripts (`gitlab-sample.ts` is used by `.gitlab-ci.yml`). `feeds.opml`: sample feed list.
- Tests sit next to the source as `*.test.ts` / `*.test.tsx`, including the split form `name#case.test.ts` (for example `parsers#parseRss.test.ts`). Root `action.test.js` covers `action.mjs`.

## Build, Test, and Development Commands

Yarn 4 (`packageManager` in `package.json`; run `corepack enable` first), Node 24.

- `yarn install`: install dependencies.
- `yarn playwright install --with-deps chromium`: run once before `yarn test`; tests need Playwright Chromium (`action/feeds/browser.ts`), as in `dev.yml`.
- `yarn test`: run the AVA suite (TypeScript via `tsx`).
- `yarn dev`: Next.js dev server (turbopack).
- `yarn build`: `next build`.
- `yarn start`: serve the built site.
- `yarn load` / `yarn loadFile`: run `index.ts` against `feeds.opml` with file storage (`loadFile` pins `INPUT_STORAGETYPE=files`; for the SQLite path run `INPUT_STORAGETYPE=sqlite yarn load`). Outside Actions (no `GITHUB_WORKSPACE`), the clone, build and publish steps are skipped.

There is no lint script. Prettier is a devDependency configured in `.prettierrc.yml` (no semicolons, single quotes, no trailing commas, always-parenthesized arrow params); format changes with `yarn prettier --write <files>`.

## Coding Style and Testing

TypeScript with ES modules. Follow `.prettierrc.yml`. Add or update an AVA test beside any code you change.

## CI

- `dev.yml` runs on every push: checkout, Node 24, `corepack enable`, `yarn install`, `yarn playwright install --with-deps chromium`, `yarn test`. On `main` a sample job then runs the published `llun/feeds@main` action (`storageType: files`), not the checked-out commit.
- `.gitlab-ci.yml` runs on pushes only, in a `node:24` image. The `test` job runs `corepack enable`, `yarn install`, `yarn test`; on `main` a `sample` job then runs `node --import tsx scripts/gitlab-sample.ts`.
- `automerge.yml` enables auto-merge for Dependabot PRs.
- `opml-update.yml` runs the action for issues or PRs titled `Update OPML file...`.

## Working with Sub-Agents (always)

The main thread (the top-level session the user talks to) always delegates work to sub-agents. It is the orchestrator: it understands the ask, splits it into tasks, briefs a sub-agent for each, checks what comes back, and owns the final answer. It does not do the bulk reading, searching, editing or reviewing itself. Sub-agents do their assigned task directly and do not spawn further sub-agents unless their brief says to.

### Rules for the main thread

- **Delegate every non-trivial step.** Exploration, code search, reading large files or logs, implementation, test runs, and code review each go to a sub-agent. The main thread keeps the conclusions and the evidence it needs to verify them, not the raw output. The main thread may still do directly: reading the parts of this file it needs to brief sub-agents, one short command or one small file whose output it needs anyway (for example `git status`, `git diff --stat`, or spot-checking a `file:line` a sub-agent cited), and git/PR bookkeeping (commits, pushes, PR descriptions, replying to and resolving review threads). Anything longer, and any edit to the repository's files, goes to a sub-agent.
- **Set model and effort on every sub-agent explicitly.** Never rely on the inherited default. Choose the cheapest model and lowest effort that will still do the task well, using the table below, and step up only where quality depends on it.
- **Run independent tasks in parallel.** Launch sub-agents that do not depend on each other in a single message so they run concurrently. Read-only work (search, reading, review) parallelizes freely; give parallel implementers separate worktrees or non-overlapping files so they do not overwrite each other.
- **Brief each sub-agent completely.** A sub-agent starts with no context: give it the goal, the relevant paths, the constraints from this file, whether it may edit files, commit or push, and the exact shape of the result you want back.
- **Verify before trusting.** Check a sub-agent's claims (diffs, test output, `file:line` references) before building on them or reporting them: spot-check them yourself within the limits above, and send anything bigger (re-running tests, reading a large diff) to a `haiku`/`low` sub-agent. If a result is wrong or shallow because the brief left something out, fix the brief and re-run at the same tier; otherwise re-run that task one step up the escalation ladder below rather than patching around it.
- **Review with a fresh sub-agent.** The code review loop always uses a separate reviewer sub-agent that did not write the change, and a new reviewer for each round; fixes go to an implementer sub-agent. Repeat until the reviewer comes back clean. If three rounds do not converge, stop and report the open findings to the user.

### Choosing model and effort

Match the tier to how much judgment the task needs, not to how important the overall change is. The models, cheapest to strongest, are `haiku`, `sonnet` and `opus`; effort levels, lowest to highest, are `low`, `medium`, `high`, `xhigh` and `max`.

| Task                                                                                                            | Model    | Effort   |
| --------------------------------------------------------------------------------------------------------------- | -------- | -------- |
| Finding files, grepping, listing usages, reading logs, summarizing docs                                         | `haiku`  | `low`    |
| Mechanical edit of exact text in one or two files (rename, formatting, applying a fix that is already decided)  | `haiku`  | `low`    |
| Mechanical edit that spans several files or needs surrounding code read (including updating docs to match code) | `sonnet` | `low`    |
| Running builds, tests and linters and reporting failures                                                        | `haiku`  | `low`    |
| Implementing a well-specified feature or fix, writing tests                                                     | `sonnet` | `medium` |
| Root-causing a CI failure or a bug with a clear reproduction                                                    | `sonnet` | `medium` |
| Architecture and design decisions, plans that touch several subsystems                                          | `opus`   | `high`   |
| Hard debugging (concurrency, data loss, security, flaky behavior with no clear cause)                           | `opus`   | `high`   |
| Code review of a change before it is pushed or merged                                                           | `opus`   | `high`   |

Guidelines:

- When the table does not cover a task and you are unsure, use `sonnet` at `medium`, a good balance of quality and cost for most coding work.
- Use `haiku` freely for retrieval and mechanical changes. It is the cheapest and fastest, and a wrong search result is cheap to redo.
- Start at `opus` or `high` effort only where a mistake is expensive: design, security-sensitive code, subtle bugs, and review. Reaching them by escalation is fine.
- Escalate one step at a time, starting from the task's row in the table. The ladder is `haiku`/`low` → `haiku`/`medium` → `sonnet`/`medium` → `sonnet`/`high` → `opus`/`high` → `opus`/`xhigh` → `opus`/`max`; a task that starts at `sonnet`/`low` steps to `sonnet`/`medium`. Never set `haiku` above `medium`, and use `max` only on `opus` after `xhigh` has fallen short.
- Do not pick other model values (for example `fable`) unless the user asks for them. When the available models change, map them onto the same three tiers (cheapest, balanced, strongest) rather than pinning these names.
- These are the Claude Code values for the Agent tool's `model` and `effort`. Agents with other tooling follow the same split as closely as it allows (separate sub-agent or pass for review, cheapest adequate model per task) rather than skipping it.
