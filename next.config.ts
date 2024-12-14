import { NextConfig } from 'next'

export default async () => {
  const core = await import('@actions/core')
  const customDomainName = core.getInput('customDomain')
  const githubRootName = process.env['GITHUB_REPOSITORY'] || ''
  const basePath = customDomainName
    ? ''
    : (githubRootName.split('/').length > 1 &&
        `/${githubRootName.split('/')[1]}`) ||
      ''
  process.env.NEXT_PUBLIC_BASE_PATH = basePath ?? '/'

  const nextConfig: NextConfig = {
    basePath,
    output: 'export'
  }
  return nextConfig
}
