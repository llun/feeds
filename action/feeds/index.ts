import * as core from '@actions/core'
import crypto from 'crypto'
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

async function createCategoryDirectory(
  rootDirectory: string,
  category: string
) {
  try {
    const stats = await fs.stat(path.join(rootDirectory, category))
    if (!stats.isDirectory()) {
      throw new Error(
        `${path.join(rootDirectory, category)} is not a directory`
      )
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new Error(`Fail to access ${rootDirectory}`)
    }
    await fs.mkdir(path.join(rootDirectory, category), { recursive: true })
  }
}

export async function createFeedFiles(githubActionPath: string) {
  try {
    const contentDirectory = core.getInput('outputDirectory')
    // This feed site uses database
    if (!contentDirectory) return
    const feedsFile = core.getInput('opmlFile', { required: true })
    const opmlContent = (
      await fs.readFile(path.join(getWorkspacePath(), feedsFile))
    ).toString('utf8')
    const opml = await readOpml(opmlContent)
    for (const category of opml) {
      const { category: title, items } = category
      await createCategoryDirectory(contentDirectory, title)
      if (!items) continue
      console.log(`Load category ${title}`)
      for (const item of items) {
        const feedData = await loadFeed(item.title, item.xmlUrl)
        if (!feedData) {
          continue
        }
        console.log(`Load ${feedData.title}`)
        const sha256 = crypto.createHash('sha256')
        sha256.update(feedData.title)
        const hexTitle = sha256.digest('hex')
        await fs.writeFile(
          path.join(contentDirectory, title, `${hexTitle}.json`),
          JSON.stringify(feedData)
        )
      }
    }
  } catch (error) {
    console.error(error.message)
    console.error(error.stack)
    core.setFailed(error)
  }
}
