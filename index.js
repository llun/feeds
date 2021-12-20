// @ts-check
const {
  setup,
  publish,
  buildSite,
  getGithubActionPath
} = require('./action/repository')

async function run() {
  await setup()
  const { createFeedDatabase } = require('./action/feeds')
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
