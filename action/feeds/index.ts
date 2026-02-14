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
import {
  cleanupUnusedMediaFiles,
  collectReferencedMediaFromContents,
  collectReferencedMediaFromEntryDirectory
} from './media'
import { loadFeed, readOpml } from './opml'

export async function createFeedDatabase(githubActionPath: string) {
  try {
    const storageType = core.getInput('storageType')
    // This feed site uses files
    if (storageType !== 'sqlite') return
    const feedsFile = core.getInput('opmlFile', { required: true })
    const opmlContent = (
      await fs.readFile(path.join(getWorkspacePath(), feedsFile))
    ).toString('utf8')
    const opml = await readOpml(opmlContent)
    const publicPath = githubActionPath
      ? path.join(githubActionPath, 'public')
      : 'public'
    const mediaDirectory = path.join(publicPath, 'media')
    await copyExistingDatabase(publicPath)
    const database = getDatabase(publicPath)
    await createTables(database)
    await createOrUpdateDatabase(database, opml, (title, url) =>
      loadFeed(title, url, { mediaDirectory })
    )
    const entryContents = (await database('Entries').select('content')) as {
      content: string
    }[]
    const referencedMedia = collectReferencedMediaFromContents(
      entryContents.map((entry) => entry.content)
    )
    await cleanupUnusedMediaFiles(mediaDirectory, referencedMedia)
    await cleanup(database)
    await database.destroy()
  } catch (error: any) {
    console.error(error.message)
    console.error(error.stack)
    core.setFailed(error)
  }
}

export async function createFeedFiles(githubActionPath: string) {
  try {
    const storageType = core.getInput('storageType')
    // This feed site uses database
    if (storageType === 'sqlite') return
    const feedsFile = core.getInput('opmlFile', { required: true })
    const publicPath = githubActionPath
      ? path.join(githubActionPath, 'contents')
      : path.join('contents')
    const mediaDirectory = githubActionPath
      ? path.join(githubActionPath, 'public', 'media')
      : path.join('public', 'media')
    await loadOPMLAndWriteFiles(
      publicPath,
      path.join(getWorkspacePath(), feedsFile),
      (title, url) => loadFeed(title, url, { mediaDirectory })
    )
    const customDomainName = core.getInput('customDomain')
    const githubRootName = process.env['GITHUB_REPOSITORY'] || ''

    await prepareDirectories(DEFAULT_PATHS)
    await createRepositoryData(DEFAULT_PATHS, githubRootName, customDomainName)
    await createCategoryData(DEFAULT_PATHS)
    await createAllEntriesData()
    const referencedMedia = await collectReferencedMediaFromEntryDirectory(
      DEFAULT_PATHS.entriesDataPath
    )
    await cleanupUnusedMediaFiles(mediaDirectory, referencedMedia)
  } catch (error: any) {
    console.error(error.message)
    console.error(error.stack)
    core.setFailed(error)
  }
}
