import {
  setup,
  publish,
  buildSite,
  getGithubActionPath
} from './action/repository'
import { createFeedDatabase } from './action/feeds'

async function run() {
  setup()
  await createFeedDatabase(getGithubActionPath())
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
