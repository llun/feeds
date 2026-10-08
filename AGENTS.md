# Repository Guidelines

`feeds-fetcher` is a GitHub Action (`llun/feeds`) that reads an OPML file of RSS/Atom feeds, fetches the entries, and builds a static Next.js feed-reader site that it publishes to a separate branch (default `contents`). See `readme.md` for user-facing behavior.

## Project Layout

- `action.yml` / `action.mjs`: action metadata (Node 24) and the entry wrapper that runs `index.ts`.
- `index.ts`: pipeline: `setup`, handle OPML issues, create feed database and files, `buildSite`, `publish`.
- `action/`: action logic: `repository.ts` (git setup, site build, publish), `issue.ts` (OPML-update issues), `feeds/` (fetching, RSS/Atom parsing, sanitizing, media, Hacker News, database/file storage).
- `app/`: Next.js App Router pages (`page.tsx`, `opml/`, layout, global CSS).
- `lib/`: shared code for the site and the action: OPML and feed URL helpers, Atom feed manifest, `storage/` (file and sqlite), `components/` (React UI), `reducers/`, `fixtures/`.
- `scripts/`: helper scripts. `feeds.opml`: sample feed list.
- Tests sit next to the source as `*.test.ts` / `*.test.tsx`.

## Build, Test, and Development Commands

Yarn 4 (`packageManager` in `package.json`; run `corepack enable` first), Node 24.

- `yarn install`: install dependencies.
- `yarn test`: run the AVA suite (TypeScript via `tsx`).
- `yarn dev`: Next.js dev server (turbopack).
- `yarn build`: `next build`.
- `yarn start`: serve the built site.
- `yarn load` / `yarn loadFile`: run `index.ts` against `feeds.opml` with database or file storage.

There is no lint script. Prettier is a devDependency configured in `.prettierrc.yml` (no semicolons, single quotes, no trailing commas, always-parenthesized arrow params); format changes with `yarn prettier --write <files>`.

## Coding Style and Testing

TypeScript with ES modules. Follow `.prettierrc.yml`. Add or update an AVA test beside any code you change.

## CI

- `dev.yml` runs on every push: checkout, Node 24, `corepack enable`, `yarn install`, `yarn playwright install --with-deps chromium`, `yarn test`. On `main` it then runs the action itself as a sample (`storageType: files`).
- `automerge.yml` enables auto-merge for Dependabot PRs.
- `opml-update.yml` runs the action for issues or PRs titled `Update OPML file...`.

## Working with Sub-Agents (always)

Agents working in this repository always delegate work to sub-agents. The main
thread is the orchestrator: it understands the ask, splits it into tasks,
briefs a sub-agent for each, checks what comes back, and owns the final
answer. It does not do the bulk reading, searching, editing or reviewing
itself.

### Rules for the main thread

- **Delegate every non-trivial step.** Exploration, code search, reading large
  files or logs, implementation, test runs, and code review each go to a
  sub-agent. The main thread keeps only the conclusions, not the raw output.
- **Pick the model and effort for every sub-agent explicitly.** Never rely on
  the inherited default. Choose the cheapest model and lowest effort that will
  still do the task well, and step up only where quality depends on it.
- **Run independent tasks in parallel.** Launch sub-agents that do not depend
  on each other in a single message so they run concurrently.
- **Brief each sub-agent completely.** A sub-agent starts with no context: give
  it the goal, the relevant paths, the constraints from this file, and the exact
  shape of the result you want back.
- **Verify before trusting.** Check a sub-agent's claims (diffs, test output,
  `file:line` references) before building on them or reporting them. If a
  cheap sub-agent's result is wrong or shallow, re-run that task one tier up
  rather than patching around it.
- **Review with a fresh sub-agent.** The code review loop always uses a
  separate reviewer sub-agent that did not write the change; fixes go to an
  implementer sub-agent; repeat until the reviewer comes back clean.

### Choosing model and effort

Match the tier to how much judgment the task needs, not to how important the
overall change is.

| Task                                                                                                       | Model           | Effort      |
| ---------------------------------------------------------------------------------------------------------- | --------------- | ----------- |
| Finding files, grepping, listing usages, reading logs, summarizing docs                                    | Haiku           | low         |
| Mechanical edits: renames, formatting, applying a fix that is already decided, updating docs to match code | Haiku or Sonnet | low         |
| Running builds, tests and linters and reporting failures                                                   | Haiku           | low         |
| Implementing a well-specified feature or fix, writing tests                                                | Sonnet          | medium      |
| Root-causing a CI failure or a bug with a clear reproduction                                               | Sonnet          | medium–high |
| Architecture and design decisions, plans that touch several subsystems                                     | Opus            | high        |
| Hard debugging (concurrency, data loss, security, flaky behaviour with no clear cause)                     | Opus            | high–max    |
| Code review of a change before it is pushed or merged                                                      | Opus            | high        |

Guidelines:

- Default to Sonnet at medium effort when unsure; it is the best balance of
  quality and cost for most coding work.
- Use Haiku freely for anything that is retrieval or a mechanical change. It is
  the cheapest and fastest, and a wrong search result is cheap to redo.
- Reserve Opus and high effort for work where a mistake is expensive: design,
  security-sensitive code, subtle bugs, and review. Use `max` effort only when
  `high` has already failed or the problem is unusually hard.
- When a newer or stronger model family is available, map the tiers onto it
  (fastest/cheapest, balanced, strongest) rather than pinning old names.
