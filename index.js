// @ts-check
const { setup, publish, buildSite } = require('./action/repository')

async function run() {
  await setup()
  const { writeFeedsContent } = require('./action/feeds')
  const { prepareEleventyData } = require('./action/eleventy/data')
  await writeFeedsContent()
  prepareEleventyData()
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
