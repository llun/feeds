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
        uses: llun/feeds@2.5
```

After this, enable github page on `contents` branch and content should be available on that page

### Configurations

This action can setup to use under domain name and different type of storage, here are the configuration that can set in github action configuration.

- `customDomain`, telling action to generate the feeds site under custom domain. This is required when generate static site because the action requires this to generate `CNAME` file.
- `branch`, branch that this action will generate the static site into. The default value is `contents`. This is a branch that you will need to point the repository static site branch to.
- `storageType`, **(Default is files)** content storage type, currently support `files` and `sqlite`. `files` is storing all feed contents in JSON tree structure while `sqlite` will store in sqlite database that client will use http chunk to download the content.
- `opmlFile`, OPML file name that store list of sites that you want to generate feed site.

#### Sample

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
        uses: llun/feeds@2.5
        with:
          storageType: files
          opmlFile: site.opml
          branch: public
```

## Sample site

- https://feeds.llun.dev
- https://llun.github.io/feeds/

## Sample repo

- https://github.com/llunbot/personal-feeds
