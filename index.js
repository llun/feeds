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
    console.error(error.message)
    console.error(error.stack)
  })
