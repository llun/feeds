# Github Action for build static feed aggregator site github page

Use this action to fetch feeds from OPML file and build static site
with all feeds information

To use it, craete a new repository and add opml file name it as `feeds.opml` with list of
website rss/atom feeds. Create a github workflow like below to make this fetch data and
put it in contents branch

```
name: Schedule

on:
  schedule:
    - cron: '*/5 * * * *'

jobs:
  playground:
    runs-on: ubuntu-latest
    name: Test
    steps:
      - name: Run Action
        uses: llun/feeds@main
```

After this, enable github page on `contents` branch and content should be available on that page
