const core = require('@actions/core')

const customDomainName = core.getInput('customDomain')
const githubRootName = process.env['GITHUB_REPOSITORY'] || ''
const basePath = customDomainName
  ? ''
  : (githubRootName.split('/').length > 1 &&
      `/${githubRootName.split('/')[1]}`) ||
    ''

/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  basePath,
  output: 'export'
}
return nextConfig
