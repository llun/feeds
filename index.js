// @ts-check
const { setup, publish, runCommand } = require('./repository')

async function run() {
  await setup()
  const { writeFeedsContent } = require('./feeds')
  await writeFeedsContent()
  await runCommand(['ls'])
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
