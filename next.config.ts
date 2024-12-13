import core from '@actions/core'
import { NextConfig } from 'next'

const customDomainName = core.getInput('customDomain')
const githubRootName = process.env['GITHUB_REPOSITORY'] || ''
const basePath = customDomainName
  ? ''
  : (githubRootName.split('/').length > 1 &&
      `/${githubRootName.split('/')[1]}`) ||
    ''

const nextConfig: NextConfig = {
  basePath,
  output: 'export'
}
export default nextConfig
