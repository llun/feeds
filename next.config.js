const core = require('@actions/core')
const { PHASE_DEVELOPMENT_SERVER } = require('next/constants')

module.exports = (phase, { defaultConfig }) => {
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
    output: 'export',
    basePath,
    ...(phase === PHASE_DEVELOPMENT_SERVER
      ? {
          async rewrites() {
            return [
              {
                source: '/:any*',
                destination: '/'
              }
            ]
          }
        }
      : null)
  }
  return nextConfig
}
