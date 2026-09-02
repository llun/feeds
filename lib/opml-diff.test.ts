import test from 'ava'
import {
  describeOpmlDiff,
  formatOpmlIssueBody,
  buildIssueUrl,
  MAX_URL_LENGTH,
  OPML_ISSUE_TITLE
} from './opml-diff'

const opmlBase = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>Feeds</title></head>
  <body>
    <outline text="Engineering" title="Engineering">
      <outline type="rss" text="llun.dev" title="llun.dev" xmlUrl="https://feeds.llun.dev/rss.xml"/>
      <outline type="rss" text="jvns.ca" title="jvns.ca" xmlUrl="https://jvns.ca/rss.xml"/>
    </outline>
    <outline text="Design" title="Design">
      <outline type="rss" text="Evil Martians" title="Evil Martians" xmlUrl="https://evilmartians.com/rss.xml"/>
    </outline>
  </body>
</opml>`

test('#describeOpmlDiff reports no changes when OPML is identical', (t) => {
  const result = describeOpmlDiff(opmlBase, opmlBase)
  t.false(result.hasChanges)
  t.is(result.addedCount, 0)
  t.is(result.removedCount, 0)
  t.true(result.summary.includes('No changes.'))
})

test('#describeOpmlDiff detects added feeds', (t) => {
  const opmlWithAdded = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>Feeds</title></head>
  <body>
    <outline text="Engineering" title="Engineering">
      <outline type="rss" text="llun.dev" title="llun.dev" xmlUrl="https://feeds.llun.dev/rss.xml"/>
      <outline type="rss" text="jvns.ca" title="jvns.ca" xmlUrl="https://jvns.ca/rss.xml"/>
      <outline type="rss" text="Hacker News" title="Hacker News" xmlUrl="https://hnrss.org/frontpage"/>
    </outline>
    <outline text="Design" title="Design">
      <outline type="rss" text="Evil Martians" title="Evil Martians" xmlUrl="https://evilmartians.com/rss.xml"/>
    </outline>
  </body>
</opml>`

  const result = describeOpmlDiff(opmlBase, opmlWithAdded)
  t.true(result.hasChanges)
  t.is(result.addedCount, 1)
  t.is(result.removedCount, 0)
  t.true(result.summary.includes('### Added'))
  t.true(
    result.summary.includes(
      '**Hacker News** (`https://hnrss.org/frontpage`) in *Engineering*'
    )
  )
  t.false(result.summary.includes('### Removed'))
})

test('#describeOpmlDiff detects removed feeds', (t) => {
  const opmlWithRemoved = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>Feeds</title></head>
  <body>
    <outline text="Engineering" title="Engineering">
      <outline type="rss" text="llun.dev" title="llun.dev" xmlUrl="https://feeds.llun.dev/rss.xml"/>
    </outline>
    <outline text="Design" title="Design">
      <outline type="rss" text="Evil Martians" title="Evil Martians" xmlUrl="https://evilmartians.com/rss.xml"/>
    </outline>
  </body>
</opml>`

  const result = describeOpmlDiff(opmlBase, opmlWithRemoved)
  t.true(result.hasChanges)
  t.is(result.addedCount, 0)
  t.is(result.removedCount, 1)
  t.false(result.summary.includes('### Added'))
  t.true(result.summary.includes('### Removed'))
  t.true(
    result.summary.includes(
      '**jvns.ca** (`https://jvns.ca/rss.xml`) from *Engineering*'
    )
  )
})

test('#describeOpmlDiff detects simultaneous additions and removals', (t) => {
  const opmlModified = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>Feeds</title></head>
  <body>
    <outline text="Engineering" title="Engineering">
      <outline type="rss" text="llun.dev" title="llun.dev" xmlUrl="https://feeds.llun.dev/rss.xml"/>
      <outline type="rss" text="New Feed" title="New Feed" xmlUrl="https://newfeed.com/rss.xml"/>
    </outline>
  </body>
</opml>`

  const result = describeOpmlDiff(opmlBase, opmlModified)
  t.true(result.hasChanges)
  t.is(result.addedCount, 1)
  t.is(result.removedCount, 2) // jvns.ca removed, Evil Martians removed
  t.true(result.summary.includes('### Added'))
  t.true(
    result.summary.includes(
      '**New Feed** (`https://newfeed.com/rss.xml`) in *Engineering*'
    )
  )
  t.true(result.summary.includes('### Removed'))
  t.true(
    result.summary.includes(
      '**jvns.ca** (`https://jvns.ca/rss.xml`) from *Engineering*'
    )
  )
  t.true(
    result.summary.includes(
      '**Evil Martians** (`https://evilmartians.com/rss.xml`) from *Design*'
    )
  )
})

test('#describeOpmlDiff detects empty categories added or removed', (t) => {
  const opmlEmptyCat = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>Feeds</title></head>
  <body>
    <outline text="EmptyCategory" title="EmptyCategory"/>
  </body>
</opml>`

  const result = describeOpmlDiff(opmlBase, opmlEmptyCat)
  t.true(result.hasChanges)
  t.true(result.summary.includes('Category *EmptyCategory*'))
})

test('#formatOpmlIssueBody wraps summary and XML in code fence', (t) => {
  const summary = '## Changes\n\n### Added\n- Feed 1'
  const xml = '<opml version="2.0"><body/></opml>'
  const body = formatOpmlIssueBody(summary, xml)

  t.true(body.startsWith(summary))
  t.true(body.includes('## Updated OPML'))
  t.true(body.includes('```xml\n<opml version="2.0"><body/></opml>\n```'))
})

test('#buildIssueUrl constructs valid GitHub issue creation URL', (t) => {
  const url = buildIssueUrl('llun/feeds', OPML_ISSUE_TITLE, 'Test Body')
  t.is(
    url,
    'https://github.com/llun/feeds/issues/new?title=Update+OPML+file&body=Test+Body'
  )
})

test('#MAX_URL_LENGTH is 6000', (t) => {
  t.is(MAX_URL_LENGTH, 6000)
})
