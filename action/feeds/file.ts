import fs from 'fs/promises'
import path from 'path'

export async function createCategoryDirectory(
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
