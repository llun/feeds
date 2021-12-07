import fs from 'fs'
import path from 'path/posix'
import crypto from 'crypto'

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

export interface CategorySite {
  id: string
  name: string
}
export interface Category {
  name: string
  sites: CategorySite[]
}
export const getCategories = (contentPath: string): Category[] => {
  try {
    const stat = fs.statSync(contentPath)
    if (!stat.isDirectory()) {
      return []
    }
    const children = fs.readdirSync(contentPath)
    return children
      .filter((child) => {
        const fullChildPath = path.join(contentPath, child)
        const stat = fs.statSync(fullChildPath)
        if (!stat.isDirectory()) return false
        return true
      })
      .map((name) => {
        const categoryPath = path.join(contentPath, name)
        const category = fs.readdirSync(categoryPath)
        const sites = category.map((site) => {
          const siteContent = JSON.parse(
            fs.readFileSync(path.join(categoryPath, site)).toString('utf-8')
          )
          return {
            id: path.basename(site, path.extname(site)),
            name: siteContent.title
          }
        })
        return { name, sites }
      })
  } catch (error) {
    console.error(error.message)
    // Can't access content path or content path is not exists
    return []
  }
}

export const prepareSiteData = (inputPath: string, outputPath: string) => {}

export const createHash = (input: string) => {
  const hash = crypto.createHash('sha256')
  hash.update(input)
  return hash.digest('hex')
}
