import test, { ExecutionContext } from 'ava'
import sinon from 'sinon'
import { BuildWatcher, checkPublishedBuild } from './freshness'

const stubFetch = (t: ExecutionContext) => {
  const stub = sinon.stub(globalThis, 'fetch')
  t.teardown(() => stub.restore())
  return stub
}

const buildInfo = (buildTime: unknown) =>
  ({ status: 200, json: async () => ({ buildTime }) }) as Response

test.serial(
  '#checkPublishedBuild tells a republished site from the same build',
  async (t) => {
    const fetch = stubFetch(t).resolves(buildInfo('2026-10-09T10:00:00.000Z'))

    t.deepEqual(
      await checkPublishedBuild('/base', '2026-10-09T08:00:00.000Z'),
      {
        status: 'newer',
        buildTime: '2026-10-09T10:00:00.000Z'
      }
    )
    t.deepEqual(
      await checkPublishedBuild('/base', '2026-10-09T10:00:00.000Z'),
      {
        status: 'current'
      }
    )

    // Asked past any cache, since a cached answer is the old build
    const [url, init] = fetch.firstCall.args as [string, RequestInit]
    t.true(url.startsWith('/base/build.json?v='))
    t.is(init.cache, 'no-store')
  }
)

test.serial(
  '#checkPublishedBuild only reports a newer build it can be sure of',
  async (t) => {
    const fetch = stubFetch(t)

    fetch.rejects(new TypeError('Failed to fetch'))
    t.deepEqual(await checkPublishedBuild('', 'b1'), { status: 'unreachable' })

    fetch.resolves({ status: 503 } as Response)
    t.deepEqual(await checkPublishedBuild('', 'b1'), { status: 'unreachable' })

    // A site without build.json, or a page that doesn't know its own build,
    // has nothing to compare
    fetch.resolves({ status: 404 } as Response)
    t.deepEqual(await checkPublishedBuild('', 'b1'), { status: 'current' })
    fetch.resolves(buildInfo('b2'))
    t.deepEqual(await checkPublishedBuild('', null), { status: 'current' })
    fetch.resolves(buildInfo(42))
    t.deepEqual(await checkPublishedBuild('', 'b1'), { status: 'current' })
  }
)

test.serial(
  '#BuildWatcher shares one check between loads failing together and moves to the build it accepts',
  async (t) => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const fetch = stubFetch(t).callsFake(async () => {
      await gate
      return buildInfo('b2')
    })
    const watcher = new BuildWatcher('', 'b1')

    const list = watcher.check()
    const article = watcher.check()
    release()
    t.deepEqual(await list, { status: 'newer', buildTime: 'b2' })
    t.is(await article, await list)
    t.is(fetch.callCount, 1)

    watcher.accept('b2')
    t.is(watcher.currentBuildTime, 'b2')
    t.deepEqual(await watcher.check(), { status: 'current' })
    t.is(fetch.callCount, 2)
  }
)
