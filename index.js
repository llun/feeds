// @ts-check
const { setup, publish, buildSite } = require('./action/repository')

async function run() {
  await setup()
  const { writeFeedsContent } = require('./action/feeds')
  await writeFeedsContent()
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
