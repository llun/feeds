import { createFeedDatabase, createFeedFiles } from './action/feeds'
import {
  buildSite,
  getGithubActionPath,
  publish,
  setup
} from './action/repository'

async function run() {
  await setup()
  await createFeedDatabase(getGithubActionPath())
  await createFeedFiles(getGithubActionPath())
  await buildSite()
  await publish()
}

run()
  .then(() => {
    console.log('Done')
    process.exit(0)
  })
  .catch((error) => {
    console.error(error.message)
    console.error(error.stack)
  })
