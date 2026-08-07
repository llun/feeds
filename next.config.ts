import { NextConfig } from 'next'

export default () => {
  const customDomainName = process.env['INPUT_CUSTOMDOMAIN'] || ''
  const githubRootName = process.env['GITHUB_REPOSITORY'] || ''
  const basePath = customDomainName
    ? ''
    : (githubRootName.split('/').length > 1 &&
        `/${githubRootName.split('/')[1]}`) ||
      ''
  process.env.NEXT_PUBLIC_BASE_PATH = basePath ?? '/'
  // The action rebuilds the site right after fetching feeds, so build time is
  // when the content was last refreshed.
  process.env.NEXT_PUBLIC_BUILD_TIME = new Date().toISOString()

  const nextConfig: NextConfig = {
    basePath,
    output: 'export',
    experimental: {
      // TypeScript 7 dropped the in-process compiler API `next build` normally
      // uses for type checking; this shells out to `tsc` instead.
      useTypeScriptCli: true
    }
  }
  return nextConfig
}
