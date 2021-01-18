// @ts-check
const { setup, publish, buildSite } = require('./repository')

async function run() {
  await setup()
  const { writeFeedsContent } = require('./feeds')
  await writeFeedsContent()
  buildSite()
  await publish()
}

run()
  .then(() => {
    console.log('Done')
  })
  .catch((error) => {
    const core = require('@actions/core')
    console.error(error.message)
    console.error(error.stack)
    core.setFailed(error)
  })
