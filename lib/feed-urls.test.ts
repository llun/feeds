import test, { ExecutionContext } from 'ava'
import {
  getAbsoluteFeedUrl,
  getBrowserFeedHref,
  getSiteConfig,
  isRootPagesRepo,
  resolveAbsoluteMediaUrl,
  resolveBasePath
} from './feed-urls'

const SITE_ENV = [
  'INPUT_CUSTOMDOMAIN',
  'INPUT_SITE_URL',
  'SITE_URL',
  'GITHUB_REPOSITORY',
  'INPUT_REPOSITORY',
  'NEXT_PUBLIC_BASE_PATH',
  'NEXT_PUBLIC_GITHUB_REPOSITORY'
]

/**
 * Clears every variable the site configuration reads (and puts them back on
 * teardown) so a test sees only the options and variables it sets itself.
 * Callers are serial because the environment is shared by the whole process.
 */
function setSiteEnv(t: ExecutionContext, values: Record<string, string> = {}) {
  for (const key of SITE_ENV) {
    const original = process.env[key]
    t.teardown(() => {
      if (original === undefined) delete process.env[key]
      else process.env[key] = original
    })
    delete process.env[key]
  }
  Object.assign(process.env, values)
}

test('#isRootPagesRepo detects user/org root pages repo correctly', (t) => {
  t.true(isRootPagesRepo('llun/llun.github.io'))
  t.true(isRootPagesRepo('Owner/Owner.github.io'))
  t.true(isRootPagesRepo('OWNER/owner.GITHUB.IO'))
  t.false(isRootPagesRepo('llun/feeds'))
  t.false(isRootPagesRepo('llun/project.github.io'))
  t.false(isRootPagesRepo(''))
  t.false(isRootPagesRepo(undefined))
})

test.serial(
  '#resolveBasePath is empty for a custom domain or a root pages repository',
  (t) => {
    setSiteEnv(t)
    t.is(resolveBasePath({ customDomain: 'feeds.example.com' }), '')
    t.is(resolveBasePath({ customDomain: 'https://feeds.example.com' }), '')
    t.is(resolveBasePath({ githubRepository: 'owner/owner.github.io' }), '')
    t.is(resolveBasePath(), '')
  }
)

test.serial(
  '#resolveBasePath uses the repository name for a project repository',
  (t) => {
    setSiteEnv(t)
    t.is(resolveBasePath({ githubRepository: 'owner/project' }), '/project')
    t.is(resolveBasePath({ githubRepository: 'llun/feeds' }), '/feeds')
  }
)

test.serial('#resolveBasePath uses the path of an explicit siteUrl', (t) => {
  setSiteEnv(t)
  t.is(resolveBasePath({ siteUrl: 'https://example.org/subpath' }), '/subpath')
  t.is(resolveBasePath({ siteUrl: 'https://example.org/subpath/' }), '/subpath')
  t.is(resolveBasePath({ siteUrl: 'https://example.org/' }), '')
  t.is(resolveBasePath({ siteUrl: 'https://example.org' }), '')
})

test.serial('#resolveBasePath normalizes an explicit basePath option', (t) => {
  setSiteEnv(t)
  t.is(resolveBasePath({ basePath: 'docs' }), '/docs')
  t.is(resolveBasePath({ basePath: '//docs/nested//' }), '/docs/nested')
  t.is(resolveBasePath({ basePath: '/' }), '')
  t.is(resolveBasePath({ basePath: '  ' }), '')
  // An explicit empty base path wins over the repository name.
  t.is(resolveBasePath({ basePath: '', githubRepository: 'owner/project' }), '')
})

test.serial('#resolveBasePath reads the deployment environment', (t) => {
  setSiteEnv(t, { INPUT_CUSTOMDOMAIN: 'feeds.example.com' })
  t.is(resolveBasePath({ githubRepository: 'owner/project' }), '')

  setSiteEnv(t, { NEXT_PUBLIC_BASE_PATH: '/built/' })
  t.is(resolveBasePath({ githubRepository: 'owner/project' }), '/built')

  setSiteEnv(t, { INPUT_SITE_URL: 'https://example.org/from-input' })
  t.is(resolveBasePath(), '/from-input')

  setSiteEnv(t, { SITE_URL: 'https://example.org/from-site' })
  t.is(resolveBasePath(), '/from-site')

  setSiteEnv(t, { GITHUB_REPOSITORY: 'owner/from-github' })
  t.is(resolveBasePath(), '/from-github')
})

test.serial(
  '#resolveBasePath prefers custom domain, then basePath, NEXT_PUBLIC_BASE_PATH, siteUrl and repository',
  (t) => {
    setSiteEnv(t, { NEXT_PUBLIC_BASE_PATH: '/env' })
    const repo = { githubRepository: 'owner/project' }
    const siteUrl = 'https://example.org/site'

    // customDomain with siteUrl is deliberately not asserted: getSiteConfig and
    // resolveBasePath disagree on which wins.
    t.is(
      resolveBasePath({ customDomain: 'a.example', basePath: '/x', ...repo }),
      ''
    )
    t.is(resolveBasePath({ basePath: '/x', siteUrl, ...repo }), '/x')
    t.is(resolveBasePath({ siteUrl, ...repo }), '/env')

    setSiteEnv(t)
    t.is(resolveBasePath({ siteUrl, ...repo }), '/site')
    t.is(resolveBasePath(repo), '/project')
  }
)

test.serial('#getSiteConfig resolves custom domain', (t) => {
  setSiteEnv(t)
  const config = getSiteConfig({ customDomain: 'feeds.example.com' })
  t.is(config.origin, 'https://feeds.example.com')
  t.is(config.basePath, '')
  t.is(config.siteBaseUrl, 'https://feeds.example.com/')
  t.is(
    getAbsoluteFeedUrl(config.siteBaseUrl, 'feeds/all.xml'),
    'https://feeds.example.com/feeds/all.xml'
  )
})

test.serial('#getSiteConfig resolves normal project repository', (t) => {
  setSiteEnv(t)
  const config = getSiteConfig({ githubRepository: 'owner/project' })
  t.is(config.origin, 'https://owner.github.io')
  t.is(config.basePath, '/project')
  t.is(config.siteBaseUrl, 'https://owner.github.io/project/')
  t.is(
    getAbsoluteFeedUrl(config.siteBaseUrl, 'feeds/all.xml'),
    'https://owner.github.io/project/feeds/all.xml'
  )
})

test.serial('#getSiteConfig resolves user/org root pages repository', (t) => {
  setSiteEnv(t)
  const config = getSiteConfig({ githubRepository: 'owner/owner.github.io' })
  t.is(config.origin, 'https://owner.github.io')
  t.is(config.basePath, '')
  t.is(config.siteBaseUrl, 'https://owner.github.io/')
  t.is(
    getAbsoluteFeedUrl(config.siteBaseUrl, 'feeds/all.xml'),
    'https://owner.github.io/feeds/all.xml'
  )
})

test.serial('#getSiteConfig resolves explicit siteUrl override', (t) => {
  setSiteEnv(t)
  const config = getSiteConfig({ siteUrl: 'https://myfeed.test/myprefix' })
  t.is(config.origin, 'https://myfeed.test')
  t.is(config.basePath, '/myprefix')
  t.is(config.siteBaseUrl, 'https://myfeed.test/myprefix/')
  t.is(
    getAbsoluteFeedUrl(config.siteBaseUrl, 'feeds/all.xml'),
    'https://myfeed.test/myprefix/feeds/all.xml'
  )
})

test.serial(
  '#getSiteConfig throws actionable error when required and no config provided',
  (t) => {
    setSiteEnv(t)
    t.throws(() => getSiteConfig({ required: true }), {
      message: /Unable to determine public site URL for feed generation/
    })
  }
)

test.serial('#getSiteConfig does not infer localhost when missing', (t) => {
  setSiteEnv(t)
  t.deepEqual(getSiteConfig(), { siteBaseUrl: '', basePath: '', origin: '' })
})

test.serial('#getSiteConfig rejects an unusable siteUrl', (t) => {
  setSiteEnv(t)
  t.throws(() => getSiteConfig({ siteUrl: 'not a url' }), {
    message: 'Invalid site URL configuration: "not a url"'
  })
  t.throws(() => getSiteConfig({ siteUrl: 'ftp://feeds.example.com/x' }), {
    message:
      'Site URL must use http or https protocol: "ftp://feeds.example.com/x"'
  })
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
