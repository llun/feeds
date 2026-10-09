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
- **Verify before trusting.** Check a sub-agent's claims (diffs, test output, `file:line` references) before building on them or reporting them: spot-check them yourself within the limits above, and send anything bigger (re-running tests, reading a large diff) to a `fast`/`low` sub-agent. If a result is wrong or shallow because the brief left something out, fix the brief and re-run at the same tier; otherwise re-run that task one step up the escalation ladder below rather than patching around it.
- **Review with a fresh sub-agent.** The code review loop always uses a separate reviewer sub-agent that did not write the change, and a new reviewer for each round; fixes go to an implementer sub-agent. Repeat until the reviewer comes back clean. If three rounds do not converge, stop and report the open findings to the user.

### Choosing model and effort

Match the tier to how much judgment the task needs, not to how important the overall change is. This policy works with any agent tool and any model, not only Claude: it is written in three model tiers (`fast`, `balanced`, `strongest`) and five effort steps (`low`, `medium`, `high`, `xhigh`, `max`), and the two tables after the task table map them onto each tool's own settings.

| Task                                                                                                            | Tier        | Effort   |
| --------------------------------------------------------------------------------------------------------------- | ----------- | -------- |
| Finding files, grepping, listing usages, reading logs, summarizing docs                                         | `fast`      | `low`    |
| Mechanical edit of exact text in one or two files (rename, formatting, applying a fix that is already decided)  | `fast`      | `low`    |
| Mechanical edit that spans several files or needs surrounding code read (including updating docs to match code) | `balanced`  | `low`    |
| Running builds, tests and linters and reporting failures                                                        | `fast`      | `low`    |
| Implementing a well-specified feature or fix, writing tests                                                     | `balanced`  | `medium` |
| Root-causing a CI failure or a bug with a clear reproduction                                                    | `balanced`  | `medium` |
| Architecture and design decisions, plans that touch several subsystems                                          | `strongest` | `high`   |
| Hard debugging (concurrency, data loss, security, flaky behavior with no clear cause)                           | `strongest` | `high`   |
| Code review of a change before it is pushed or merged                                                           | `strongest` | `high`   |

Example models per tier. Model names change every few months, so check the tool's current model list and use its newest model in the same tier; any model not listed here (another vendor, a local model, a new release) goes in the tier that matches its capability and cost.

| Tier                                                             | Claude Code (Agent tool `model`) | OpenAI Codex                                      | Google Antigravity        | Open-weight (Qwen, DeepSeek, GLM, Kimi, gpt-oss, …)                                                      |
| ---------------------------------------------------------------- | -------------------------------- | ------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------- |
| `fast`: cheapest and quickest, for retrieval and mechanical work | `haiku`                          | the smallest current GPT model (for example Luna) | a Gemini Flash model      | a small model, such as Qwen3-Coder-30B-A3B or gpt-oss-20b                                                |
| `balanced`: most implementation work                             | `sonnet`                         | the mid-tier current GPT model (for example Sol)  | Claude Sonnet             | a mid-size coding model, such as Qwen3-Coder-Next, DeepSeek V4 Flash or gpt-oss-120b                     |
| `strongest`: design, hard debugging, high-risk code and review   | `opus`                           | the top current GPT model (for example Astra)     | Claude Opus or Gemini Pro | the largest current release of a frontier family, such as Qwen3.8, DeepSeek V4 Pro, GLM-5.2 or Kimi K2.6 |

How each tool sets the effort step:

| Tool               | How to set effort                                                                                                                                                                                                                                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code        | The Agent tool's `effort` takes the five steps as written.                                                                                                                                                                                                                                                                                                    |
| OpenAI Codex       | `model_reasoning_effort` in the config or in a custom agent's TOML file (`.codex/agents/`); use the config value Codex documents for each step (for example `low`, `medium`, `high`, `xhigh`), and map `max` to its highest documented value.                                                                                                                 |
| Google Antigravity | For Gemini models, pick the effort level the model picker offers that is closest to the step. Models offered as a single thinking variant (such as Claude in Antigravity) have no effort steps, so skip them as the ladder says.                                                                                                                              |
| Open-weight models | Use the serving stack's reasoning setting where it has one (`reasoning_effort`, a thinking on/off switch, or a thinking-token budget): thinking off for `low`, on with the default budget for `medium`, a larger budget for `high`, and the largest budget the stack allows for `xhigh` and `max`. If it has none, skip the effort steps, as the ladder says. |

Guidelines:

- When the table does not cover a task and you are unsure, use `balanced` at `medium`, a good balance of quality and cost for most coding work.
- Use `fast` freely for retrieval and mechanical changes. It is the cheapest and quickest, and a wrong search result is cheap to redo.
- Start at `strongest` or `high` effort only where a mistake is expensive: design, security-sensitive code, subtle bugs, and review. Reaching them by escalation is fine.
- Escalate one step at a time, starting from the task's row in the table. The ladder is `fast`/`low` → `fast`/`medium` → `balanced`/`medium` → `balanced`/`high` → `strongest`/`high` → `strongest`/`xhigh` → `strongest`/`max`; a task that starts at `balanced`/`low` steps to `balanced`/`medium`. Never set `fast` above `medium`, and use `max` only on `strongest` after `xhigh` has fallen short. Where a tool has fewer effort steps than this ladder, skip the steps it lacks.
- Do not go beyond these tiers and steps (for example Claude Code's `fable` model, or an effort level above `max`) unless the user asks for it.
- Tools without a sub-agent feature still follow the same split as closely as they allow (a separate session or pass for review, the cheapest adequate model per task) rather than skipping it.
