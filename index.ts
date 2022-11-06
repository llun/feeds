import {
  setup,
  publish,
  buildSite,
  getGithubActionPath
} from './action/repository'
import { createFeedDatabase, createFeedFiles } from './action/feeds'

async function run() {
  await setup()
  await createFeedDatabase(getGithubActionPath())
  await createFeedFiles()
  buildSite()
  await publish()
}

run()
  .then(() => {
    console.log('Done')
  })
  .catch((error) => {
    console.error(error.message)
    console.error(error.stack)
  })
