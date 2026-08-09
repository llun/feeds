import fs from 'fs/promises'
import path from 'path'
import {
  getActionInput,
  getWorkspacePath,
  restorePublishedMedia
} from '../repository'
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
  collectReferencedMediaFromEntryDirectory,
  createMediaStore,
  getMediaDirectory
} from './media'
import { enrichSiteWithHackerNewsComments } from './hackernews'
import { loadFeed, readOpml } from './opml'
import type { Site } from './parsers'

function getPublicPath(githubActionPath: string) {
  return githubActionPath ? path.join(githubActionPath, 'public') : 'public'
}

async function createLocalizingFeedLoader(githubActionPath: string) {
  await restorePublishedMedia(getPublicPath(githubActionPath))
  const mediaDirectory = getMediaDirectory(githubActionPath)
  const store = createMediaStore({ mediaDirectory })
  const feedLoader = async (title: string, url: string) => {
    const site: Site | null = await loadFeed(title, url)
    if (!site) return null
    // HN entries carry only a "Comments" link, so the discussion is fetched
    // and appended before media localization walks the content.
    const enriched = await enrichSiteWithHackerNewsComments(site)
    return store.localizeSite(enriched)
  }
  return { feedLoader, mediaDirectory }
}

export async function createFeedDatabase(githubActionPath: string) {
  try {
    const storageType = getActionInput('storageType')
    // This feed site uses files
    if (storageType !== 'sqlite') return
    const feedsFile = getActionInput('opmlFile', { required: true })
    const opmlContent = (
      await fs.readFile(path.join(getWorkspacePath(), feedsFile))
    ).toString('utf8')
    const opml = await readOpml(opmlContent)
    const publicPath = getPublicPath(githubActionPath)
    const { feedLoader, mediaDirectory } =
      await createLocalizingFeedLoader(githubActionPath)
    await copyExistingDatabase(publicPath)
    const database = getDatabase(publicPath)
    await createTables(database)
    await createOrUpdateDatabase(database, opml, feedLoader)
    const entryContents = (await database('Entries').select('content')) as {
      content: string
    }[]
    await cleanupUnusedMediaFiles(
      mediaDirectory,
      collectReferencedMediaFromContents(
        entryContents.map((entry) => entry.content)
      )
    )
    await cleanup(database)
    await database.destroy()
  } catch (error: any) {
    console.error(error.message)
    console.error(error.stack)
    throw error
  }
}

export async function createFeedFiles(githubActionPath: string) {
  try {
    const storageType = getActionInput('storageType')
    // This feed site uses database
    if (storageType === 'sqlite') return
    const feedsFile = getActionInput('opmlFile', { required: true })
    const publicPath = githubActionPath
      ? path.join(githubActionPath, 'contents')
      : path.join('contents')
    const { feedLoader, mediaDirectory } =
      await createLocalizingFeedLoader(githubActionPath)
    await loadOPMLAndWriteFiles(
      publicPath,
      path.join(getWorkspacePath(), feedsFile),
      feedLoader
    )
    const customDomainName = getActionInput('customDomain')
    const githubRootName = process.env['GITHUB_REPOSITORY'] || ''

    await prepareDirectories(DEFAULT_PATHS)
    await createRepositoryData(DEFAULT_PATHS, githubRootName, customDomainName)
    await createCategoryData(DEFAULT_PATHS)
    await createAllEntriesData()
    await cleanupUnusedMediaFiles(
      mediaDirectory,
      await collectReferencedMediaFromEntryDirectory(
        DEFAULT_PATHS.entriesDataPath
      )
    )
  } catch (error: any) {
    console.error(error.message)
    console.error(error.stack)
    throw error
  }
}
