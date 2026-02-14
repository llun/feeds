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

  const nextConfig: NextConfig = {
    basePath,
    output: 'export'
  }
  return nextConfig
}
