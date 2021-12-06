import fs from 'fs'
import path from 'path/posix'

export interface GithubConfigs {
  repository: string
}
interface GithubConfigParameters {
  // Github repository path in format 'user/repository'
  // This provide by `GITHUB_REPOSITORY` in github action
  githubRootName: string
  // Optional custom domain name.
  // Input from Github action configuration `customDomain`
  // Get this value by `core.getInput('customDomain')`
  customDomain?: string
}
export const getGithubConfigs = ({
  githubRootName,
  customDomain
}: GithubConfigParameters): GithubConfigs => {
  return {
    repository:
      (!customDomain &&
        githubRootName.split('/').length > 1 &&
        `/${githubRootName.split('/')[1]}`) ||
      ''
  }
}

export const getCategories = (contentPath: string) => {
  try {
    const stat = fs.statSync(contentPath)
    if (!stat.isDirectory()) {
      return []
    }
    const children = fs.readdirSync(contentPath)
    return children.filter((child) => {
      const fullChildPath = path.join(contentPath, child)
      const stat = fs.statSync(fullChildPath)
      if (!stat.isDirectory()) return false
      return true
    })
  } catch (error) {
    console.error(error.message)
    // Can't access content path or content path is not exists
    return []
  }
}
