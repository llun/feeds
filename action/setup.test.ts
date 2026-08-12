import test from 'ava'

import { setup } from './repository'

/**
 * setup() reads the workflow ref through @actions/github, which builds its
 * context when the module is first imported. This lives in its own file so the
 * import happens with the environment below rather than whatever an earlier
 * test in a shared file left behind: ava runs each test file in its own
 * process.
 */
test('#setup refuses to publish onto the branch it reads', async (t) => {
  const environment = { ...process.env }
  t.teardown(() => {
    for (const key of Object.keys(process.env)) delete process.env[key]
    Object.assign(process.env, environment)
  })

  // The throw happens before the clone, so the workspace is never written to.
  process.env['GITHUB_WORKSPACE'] = '/tmp/unused'
  process.env['GITHUB_REF'] = 'refs/heads/contents'
  process.env['GITHUB_REPOSITORY'] = 'llun/feeds'
  process.env['INPUT_TOKEN'] = 'token'
  process.env['INPUT_BRANCH'] = 'contents'
  delete process.env['GITHUB_EVENT_PATH']

  await t.throwsAsync(() => setup(), {
    message: 'Branch contents cannot be both the source and the publish branch'
  })
})
