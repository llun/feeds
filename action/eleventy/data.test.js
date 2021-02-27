// @ts-check
const test = /** @type {import('ava').TestInterface<{}>} */ (require('ava')
  .default)
const fs = require('fs')
const { createRepositoryData, REPOSITORY_DATA_PATH } = require('./data')

test('#createRepositoryData generate repository information in repository file', (t) => {
  try {
    fs.unlinkSync(REPOSITORY_DATA_PATH)
  } catch (error) {}
  t.deepEqual(createRepositoryData('', 'feeds.llun.dev'), { repository: '' })
  t.deepEqual(
    JSON.parse(fs.readFileSync(REPOSITORY_DATA_PATH).toString('utf8')),
    { repository: '' }
  )

  t.deepEqual(createRepositoryData('octocat/Hello-World', 'feeds.llun.dev'), {
    repository: ''
  })
  t.deepEqual(createRepositoryData('octocat/Hello-World', ''), {
    repository: '/Hello-World'
  })
  t.deepEqual(
    JSON.parse(fs.readFileSync(REPOSITORY_DATA_PATH).toString('utf8')),
    { repository: '/Hello-World' }
  )
  fs.unlinkSync(REPOSITORY_DATA_PATH)
})
