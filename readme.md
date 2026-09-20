# Github Action for building static feed aggregator site

A GitHub Action that fetches RSS/Atom feeds from an OPML file and builds a static site aggregating all the feed content. This project creates a modern, responsive feed reader as a static site.

This action runs on Node.js 24 (`runs.using: node24`).

## Usage

To use it, create a new repository and add an OPML file named `feeds.opml` with your list of website RSS/Atom feeds. Create a GitHub workflow like the one below to fetch data and store it in a contents branch:

```
name: Schedule

on:
  schedule:
    - cron: '0 * * * *'
  workflow_dispatch:
  issues:
    types: [opened]

jobs:
  playground:
    runs-on: ubuntu-latest
    name: Test
    permissions:
      contents: write
      issues: write
    steps:
      - name: Run Action
        uses: llun/feeds@4.7.0
```

After this, enable GitHub Pages on the `contents` branch and the content will be available on that page.

The action always reads the OPML file from the branch that triggered the workflow (for example `main`), then publishes generated output to the configured `branch`. The two have to be different branches: the published branch is replaced by a history the action owns, so the run stops before it clones rather than publish over the branch it read the feeds from.

## Images in feed content

Images referenced by feed entries are downloaded while the feeds are loaded and published alongside the site under `/media`, so the reader never hotlinks a publisher's server. This avoids hotlink protection, mixed content and cross-origin resource policy blocking.

Images that cannot be downloaded keep their original URL and are rendered with `referrerpolicy="no-referrer"`. Because feeds are re-read on every run, a publisher that was temporarily unavailable is picked up again on a later run. SVG images are always kept remote, since a published SVG would be a script running on the site's own origin.

Each run restores the media files of the published branch before downloading, so only images that have not been seen before are fetched, and files no longer referenced by any entry are removed. Schedule only one run at a time (a workflow `concurrency` group) because the publish step force pushes the whole site.

## Published branch history

The published branch keeps only the last 5 runs. Each run rebuilds those commits without the history behind them and drops the oldest one, so the branch stays a small, self contained snapshot of the site instead of growing with the source branch it was generated from. Branches published by earlier versions are trimmed on their next run, and only commits written by this action are kept.

## Hacker News comments

Hacker News feeds (the official RSS, hnrss, or any mirror) publish entries whose content is only a "Comments" link. For those entries the action fetches the discussion from the HN Algolia API and appends it to the entry, so the reader shows the story text and the top 20 comments, nested 3 levels deep, right below the link. Threads cut short by those caps end with a link to the full discussion on Hacker News, and an entry whose discussion cannot be fetched keeps its original content.

## Aggregate Atom Feeds

The site generates static RFC 4287 Atom 1.0 feeds during each scheduled refresh:

- **Global feed**: Located at `/feeds/all.xml` relative to the site root (e.g. `https://owner.github.io/repo/feeds/all.xml` or `https://example.com/feeds/all.xml`). It aggregates all distinct items currently stored by the app. Note that "all items" reflects the currently stored entries in the app dataset, not an unlimited historical archive.
- **Category feeds**: Located at `/feeds/categories/<category-id>.xml`, containing all distinct stored items belonging to that category. Category IDs are derived from the SHA-256 hash of the exact UTF-8 category title. Renaming a category produces a new category feed ID and URL. Empty categories produce valid empty Atom feeds.
- **Feed Manifest**: Located at `/feeds/manifest.json`. Maps the global feed and category titles to their respective site-relative feed paths.
- **Sidebar Integration**: Small feed broadcast icons appear beside "All Items" and each category label in the sidebar. Clicking a feed icon opens the raw Atom XML in a new tab, and right-clicking allows copying the URL. Clicking the feed icon does not select, expand, or collapse the category.
- **Autodiscovery**: The site includes a `<link rel="alternate" type="application/atom+xml" ...>` autodiscovery tag in the HTML `<head>`.
- **Timestamps**: Entry and feed timestamps adhere to RFC 3339. Entries without publication dates and empty feeds use a deterministic fallback timestamp (`1970-01-01T00:00:00Z`). Build timestamps are deliberately avoided so unchanged content does not appear newly updated on every build.
- **Browser Display**: Browsers render raw XML differently (some display a tree view, some show raw text). The URL can be copied directly into any standard feed reader.
- **Upstream Subscriptions**: Subscriptions in `feeds.opml` continue to support both upstream RSS and Atom feed inputs unchanged.

## Configurations

This action can be configured to use a custom domain and different types of storage. Here are the available configuration options:

- `customDomain`: Specifies the custom domain for the feeds site. Required when generating a static site as it's needed to generate the `CNAME` file.
- `siteUrl`: Explicit site URL override (e.g. `https://example.com/subpath` or via `SITE_URL` environment variable). Useful for local or non-GitHub generation where public URL cannot be inferred from repository configuration.
- `branch`: Branch where the static site will be generated. The default value is `contents`. This is the branch you'll need to point the repository's GitHub Pages to.
- `storageType`: **(Default is `files`)** Content storage type, currently supports `files` and `sqlite`.
  - `database`: Legacy alias that behaves like `files`
  - `files`: Stores all feed contents in a JSON tree structure
  - `sqlite`: Stores content in a SQLite database that the client will download using HTTP chunks
- `opmlFile`: Name of the OPML file containing the list of sites you want to include in your feed site.

### Sample Configuration

```
name: Schedule

on:
  schedule:
    - cron: '0 * * * *'
  workflow_dispatch:
  issues:
    types: [opened]

jobs:
  playground:
    runs-on: ubuntu-latest
    name: Generate Feeds
    steps:
      - name: Run Action
        uses: llun/feeds@4.7.0
        with:
          storageType: files
          opmlFile: site.opml
          branch: public
```

## Updating subscriptions via GitHub Issues

The reader includes an in-app OPML editor (`/opml`) where you can add, remove, and reorganize feeds. Clicking **Save OPML** copies the updated OPML to your clipboard and opens a prefilled GitHub issue describing what is being added or removed. You then paste the OPML into the issue body to submit.

To automatically apply subscription updates when an issue is created, enable the `issues` trigger in your workflow with the required permissions:

```yaml
name: Feeds

on:
  schedule:
    - cron: '0 * * * *'
  workflow_dispatch:
  issues:
    types: [opened]

jobs:
  playground:
    runs-on: ubuntu-latest
    name: Build Feeds
    permissions:
      contents: write
      issues: write
    steps:
      - name: Run Action
        uses: llun/feeds@4.7.0
        with:
          storageType: files
```

When an issue titled `Update OPML file` is opened by a repository owner or collaborator, the action extracts the OPML, commits and pushes only `feeds.opml` to your source branch, automatically closes the issue, and rebuilds the site.

## Sample Sites

- https://feeds.llun.dev
- https://llun.github.io/feeds/

## Sample Repository

- https://github.com/llunbot/personal-feeds
