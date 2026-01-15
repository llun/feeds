# Github Action for building static feed aggregator site

A GitHub Action that fetches RSS/Atom feeds from an OPML file and builds a static site aggregating all the feed content. This project creates a modern, responsive feed reader as a static site.

## Usage

To use it, create a new repository and add an OPML file named `feeds.opml` with your list of website RSS/Atom feeds. Create a GitHub workflow like the one below to fetch data and store it in a contents branch:

```
name: Schedule

on:
  schedule:
    - cron: '0 * * * *'

jobs:
  playground:
    runs-on: ubuntu-latest
    name: Test
    steps:
      - name: Run Action
        uses: llun/feeds@3.0.0
```

After this, enable GitHub Pages on the `contents` branch and the content will be available on that page.

## Configurations

This action can be configured to use a custom domain and different types of storage. Here are the available configuration options:

- `customDomain`: Specifies the custom domain for the feeds site. Required when generating a static site as it's needed to generate the `CNAME` file.
- `branch`: Branch where the static site will be generated. The default value is `contents`. This is the branch you'll need to point the repository's GitHub Pages to.
- `storageType`: **(Default is `files`)** Content storage type, currently supports `files` and `sqlite`.
  - `files`: Stores all feed contents in a JSON tree structure
  - `sqlite`: Stores content in a SQLite database that the client will download using HTTP chunks
- `opmlFile`: Name of the OPML file containing the list of sites you want to include in your feed site.

### Sample Configuration

```
name: Schedule

on:
  schedule:
    - cron: '0 * * * *'

jobs:
  playground:
    runs-on: ubuntu-latest
    name: Generate Feeds
    steps:
      - name: Run Action
        uses: llun/feeds@3.0.0
        with:
          storageType: files
          opmlFile: site.opml
          branch: public
```

## Sample Sites

- https://feeds.llun.dev
- https://llun.github.io/feeds/

## Sample Repository

- https://github.com/llunbot/personal-feeds
