// @ts-check
const { setup, publish } = require('./repository')

async function run() {
  await setup()
  const { writeFeedsContent } = require('./feeds')
  await writeFeedsContent()
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
