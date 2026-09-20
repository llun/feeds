import test from 'ava'
import {
  getAbsoluteFeedUrl,
  getBrowserFeedHref,
  getSiteConfig,
  getSiteRelativeFeedPath,
  getSiteRelativeManifestPath,
  isRootPagesRepo,
  resolveAbsoluteMediaUrl,
  resolveBasePath
} from './feed-urls'

test('#isRootPagesRepo detects user/org root pages repo correctly', (t) => {
  t.true(isRootPagesRepo('llun/llun.github.io'))
  t.true(isRootPagesRepo('Owner/Owner.github.io'))
  t.true(isRootPagesRepo('OWNER/owner.GITHUB.IO'))
  t.false(isRootPagesRepo('llun/feeds'))
  t.false(isRootPagesRepo('llun/project.github.io'))
  t.false(isRootPagesRepo(''))
  t.false(isRootPagesRepo(undefined))
})

test('#resolveBasePath calculates base path consistent with deployment rules', (t) => {
  // Custom domain: always empty base path
  t.is(resolveBasePath({ customDomain: 'feeds.example.com' }), '')
  t.is(resolveBasePath({ customDomain: 'https://feeds.example.com' }), '')

  // User/Org root repo: always empty base path
  t.is(resolveBasePath({ githubRepository: 'owner/owner.github.io' }), '')

  // Normal project repo: repo name prefixed with slash
  t.is(resolveBasePath({ githubRepository: 'owner/project' }), '/project')
  t.is(resolveBasePath({ githubRepository: 'llun/feeds' }), '/feeds')

  // Explicit siteUrl override
  t.is(resolveBasePath({ siteUrl: 'https://example.org/subpath' }), '/subpath')
  t.is(resolveBasePath({ siteUrl: 'https://example.org/subpath/' }), '/subpath')
  t.is(resolveBasePath({ siteUrl: 'https://example.org/' }), '')
  t.is(resolveBasePath({ siteUrl: 'https://example.org' }), '')
})

test('#getSiteConfig resolves custom domain', (t) => {
  const config = getSiteConfig({ customDomain: 'feeds.example.com' })
  t.is(config.origin, 'https://feeds.example.com')
  t.is(config.basePath, '')
  t.is(config.siteBaseUrl, 'https://feeds.example.com/')
  t.is(
    getAbsoluteFeedUrl(config.siteBaseUrl, 'feeds/all.xml'),
    'https://feeds.example.com/feeds/all.xml'
  )
})

test('#getSiteConfig resolves normal project repository', (t) => {
  const config = getSiteConfig({ githubRepository: 'owner/project' })
  t.is(config.origin, 'https://owner.github.io')
  t.is(config.basePath, '/project')
  t.is(config.siteBaseUrl, 'https://owner.github.io/project/')
  t.is(
    getAbsoluteFeedUrl(config.siteBaseUrl, 'feeds/all.xml'),
    'https://owner.github.io/project/feeds/all.xml'
  )
})

test('#getSiteConfig resolves user/org root pages repository', (t) => {
  const config = getSiteConfig({ githubRepository: 'owner/owner.github.io' })
  t.is(config.origin, 'https://owner.github.io')
  t.is(config.basePath, '')
  t.is(config.siteBaseUrl, 'https://owner.github.io/')
  t.is(
    getAbsoluteFeedUrl(config.siteBaseUrl, 'feeds/all.xml'),
    'https://owner.github.io/feeds/all.xml'
  )
})

test('#getSiteConfig resolves explicit siteUrl override', (t) => {
  const config = getSiteConfig({ siteUrl: 'https://myfeed.test/myprefix' })
  t.is(config.origin, 'https://myfeed.test')
  t.is(config.basePath, '/myprefix')
  t.is(config.siteBaseUrl, 'https://myfeed.test/myprefix/')
  t.is(
    getAbsoluteFeedUrl(config.siteBaseUrl, 'feeds/all.xml'),
    'https://myfeed.test/myprefix/feeds/all.xml'
  )
})

test('#getSiteConfig throws actionable error when required and no config provided', (t) => {
  const oldEnv = { ...process.env }
  delete process.env['INPUT_CUSTOMDOMAIN']
  delete process.env['INPUT_SITE_URL']
  delete process.env['SITE_URL']
  delete process.env['GITHUB_REPOSITORY']
  delete process.env['INPUT_REPOSITORY']

  try {
    t.throws(
      () => {
        getSiteConfig({ required: true })
      },
      {
        message: /Unable to determine public site URL for feed generation/
      }
    )
  } finally {
    process.env = oldEnv
  }
})

test('#getSiteConfig does not infer localhost when missing', (t) => {
  const oldEnv = { ...process.env }
  delete process.env['INPUT_CUSTOMDOMAIN']
  delete process.env['INPUT_SITE_URL']
  delete process.env['SITE_URL']
  delete process.env['GITHUB_REPOSITORY']
  delete process.env['INPUT_REPOSITORY']

  try {
    const config = getSiteConfig()
    t.is(config.origin, '')
    t.is(config.siteBaseUrl, '')
    t.not(config.origin, 'http://localhost')
  } finally {
    process.env = oldEnv
  }
})

test('#getSiteRelativeFeedPath returns correct site-relative paths', (t) => {
  t.is(getSiteRelativeFeedPath('all'), 'feeds/all.xml')
  t.is(
    getSiteRelativeFeedPath({ categoryId: 'abcdef1234567890' }),
    'feeds/categories/abcdef1234567890.xml'
  )
  t.is(getSiteRelativeManifestPath(), 'feeds/manifest.json')
})

test('#getBrowserFeedHref adds deployment base path exactly once', (t) => {
  // With project base path
  t.is(
    getBrowserFeedHref('feeds/all.xml', '/project'),
    '/project/feeds/all.xml'
  )
  t.is(
    getBrowserFeedHref('/feeds/all.xml', '/project'),
    '/project/feeds/all.xml'
  )
  t.is(getBrowserFeedHref('feeds/all.xml', 'project'), '/project/feeds/all.xml')
  // Already has base path - do not double prefix!
  t.is(
    getBrowserFeedHref('/project/feeds/all.xml', '/project'),
    '/project/feeds/all.xml'
  )
  t.is(
    getBrowserFeedHref('project/feeds/all.xml', '/project'),
    '/project/feeds/all.xml'
  )

  // With empty base path (custom domain or root pages)
  t.is(getBrowserFeedHref('feeds/all.xml', ''), '/feeds/all.xml')
  t.is(getBrowserFeedHref('/feeds/all.xml', ''), '/feeds/all.xml')

  // Under /feeds deployment (must be /feeds/feeds/all.xml, neither segment stripped)
  t.is(getBrowserFeedHref('feeds/all.xml', '/feeds'), '/feeds/feeds/all.xml')
  t.is(
    getBrowserFeedHref('/feeds/feeds/all.xml', '/feeds'),
    '/feeds/feeds/all.xml'
  )

  // Category feed
  t.is(
    getBrowserFeedHref('feeds/categories/1234.xml', '/project'),
    '/project/feeds/categories/1234.xml'
  )
  t.is(
    getBrowserFeedHref('feeds/categories/1234.xml', '/feeds'),
    '/feeds/feeds/categories/1234.xml'
  )
})

test('#resolveAbsoluteMediaUrl preserves project base path and avoids double prefixing', (t) => {
  const projectBaseUrl = 'https://owner.github.io/project/'
  const basePath = '/project'

  // Local media path
  t.is(
    resolveAbsoluteMediaUrl('/media/abc.png', projectBaseUrl, basePath),
    'https://owner.github.io/project/media/abc.png'
  )

  // Already prefixed with basePath
  t.is(
    resolveAbsoluteMediaUrl('/project/media/abc.png', projectBaseUrl, basePath),
    'https://owner.github.io/project/media/abc.png'
  )

  // Remote URL is preserved
  t.is(
    resolveAbsoluteMediaUrl(
      'https://remote.cdn/img.png',
      projectBaseUrl,
      basePath
    ),
    'https://remote.cdn/img.png'
  )

  // Data URI is preserved
  t.is(
    resolveAbsoluteMediaUrl(
      'data:image/png;base64,abc',
      projectBaseUrl,
      basePath
    ),
    'data:image/png;base64,abc'
  )

  // Root site (custom domain or root pages)
  const rootBaseUrl = 'https://feeds.example.com/'
  t.is(
    resolveAbsoluteMediaUrl('/media/abc.png', rootBaseUrl, ''),
    'https://feeds.example.com/media/abc.png'
  )
})
