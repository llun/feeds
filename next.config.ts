import { NextConfig } from 'next'

function getInput(name: string) {
  const compact = `INPUT_${name.toUpperCase()}`
  const snake = `INPUT_${name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .toUpperCase()}`
  return process.env[compact] ?? process.env[snake] ?? ''
}

export default async () => {
  const customDomainName = getInput('customDomain')
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
