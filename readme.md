# Github Action for building static feed aggregator site

Use this action to fetch feeds from OPML file and build static site
with all feeds information

To use it, create a new repository and add opml file name it as `feeds.opml` with list of
website rss/atom feeds. Create a github workflow like below to make this fetch data and
put it in contents branch

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
        uses: llun/feeds@2.2
```

After this, enable github page on `contents` branch and content should be available on that page

## Version 1

Version 2 is base on Next.js and using sqlite3 database, which makes it a bit larger. However,
version 1 which is using 11ty and no sqlite, is still available on branch `v1`. Use below
configuration if you want to use previous version.

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
        uses: llun/feeds@v1
```

or with latest v1 tag

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
        uses: llun/feeds@1.3.1
```

## Sample site

- https://feeds.llun.dev
- https://llun.github.io/feeds/

## Sample repo

- https://github.com/llunbot/personal-feeds
