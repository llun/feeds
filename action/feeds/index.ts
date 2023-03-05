import * as core from '@actions/core'
import fs from 'fs/promises'
import path from 'path'
import { getWorkspacePath } from '../repository'
import {
  cleanup,
  copyExistingDatabase,
  createOrUpdateDatabase,
  createTables,
  getDatabase
} from './database'
import {
  DEFAULT_PATHS,
  createAllEntriesData,
  createCategoryData,
  createRepositoryData,
  loadOPMLAndWriteFiles,
  prepareDirectories
} from './file'
import { loadFeed, readOpml } from './opml'

export async function createFeedDatabase(githubActionPath: string) {
  try {
    const contentDirectory = core.getInput('outputDirectory')
    // This feed site uses files
    if (contentDirectory) return
    const feedsFile = core.getInput('opmlFile', { required: true })
    const opmlContent = (
      await fs.readFile(path.join(getWorkspacePath(), feedsFile))
    ).toString('utf8')
    const opml = await readOpml(opmlContent)
    const publicPath = githubActionPath
      ? path.join(githubActionPath, 'public')
      : 'public'
    await copyExistingDatabase(publicPath)
    const database = getDatabase(publicPath)
    await createTables(database)
    await createOrUpdateDatabase(database, opml, loadFeed)
    await cleanup(database)
    await database.destroy()
  } catch (error) {
    console.error(error.message)
    console.error(error.stack)
    core.setFailed(error)
  }
}

export async function createFeedFiles(githubActionPath: string) {
  try {
    const contentDirectory = core.getInput('outputDirectory')
    // This feed site uses database
    if (!contentDirectory) return
    const feedsFile = core.getInput('opmlFile', { required: true })
    await loadOPMLAndWriteFiles(
      contentDirectory,
      path.join(getWorkspacePath(), feedsFile)
    )
    const publicPath = githubActionPath
      ? path.join(githubActionPath, 'public')
      : 'public'
    const customDomainName = core.getInput('customDomain')
    const githubRootName = process.env['GITHUB_REPOSITORY'] || ''

    await prepareDirectories(DEFAULT_PATHS)
    await createRepositoryData(DEFAULT_PATHS, githubRootName, customDomainName)
    await createCategoryData(DEFAULT_PATHS)
    await createAllEntriesData()
  } catch (error) {
    console.error(error.message)
    console.error(error.stack)
    core.setFailed(error)
  }
}
