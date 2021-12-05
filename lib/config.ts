interface GithubConfigs {
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
