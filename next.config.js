const core = require('@actions/core')

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
    basePath,
    async rewrites() {
      return [
        {
          source: '/:any*',
          destination: '/'
        }
      ]
    }
  }
  return nextConfig
}
