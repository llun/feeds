import test, { ExecutionContext } from 'ava'
import sinon from 'sinon'
import {
  BuildWatcher,
  DataRefresher,
  RefreshState,
  checkPublishedBuild
} from './freshness'

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

test.serial(
  '#BuildWatcher does not report a build that loaded while the check ran',
  async (t) => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    stubFetch(t).callsFake(async () => {
      await gate
      return buildInfo('b2')
    })
    const watcher = new BuildWatcher('', 'b1')

    const check = watcher.check()
    watcher.accept('b2')
    release()
    t.deepEqual(await check, { status: 'current' })
  }
)

const createRefresher = (load: (buildTime: string) => Promise<string>) => {
  const watcher = new BuildWatcher('', 'b1')
  const states: RefreshState[] = []
  const apply = sinon.spy()
  const refresher = new DataRefresher<string>({
    watcher,
    load,
    apply,
    onStateChange: (state) => states.push(state)
  })
  return { watcher, refresher, states, apply }
}

test.serial(
  '#DataRefresher reloads a republished build once for loads failing together',
  async (t) => {
    stubFetch(t).resolves(buildInfo('b2'))
    const load = sinon.stub().resolves('data for b2')
    const { watcher, refresher, states, apply } = createRefresher(load)

    const [list, article] = await Promise.all([
      refresher.recover(),
      refresher.recover()
    ])

    t.is(list, 'reloaded')
    t.is(article, 'reloaded')
    t.true(load.calledOnceWith('b2'))
    t.true(apply.calledOnceWith('b2', 'data for b2'))
    t.is(watcher.currentBuildTime, 'b2')
    t.deepEqual(states, ['refreshing', 'refreshed'])
    // The same build again is not a reason to reload
    t.is(await refresher.recover(), 'current')
  }
)

test.serial(
  '#DataRefresher leaves the old build on screen when the reload fails, and retries it',
  async (t) => {
    stubFetch(t).resolves(buildInfo('b2'))
    const load = sinon.stub()
    load.onFirstCall().rejects(new Error('categories.json 503'))
    load.onSecondCall().resolves('data for b2')
    const { watcher, refresher, states, apply } = createRefresher(load)

    t.is(await refresher.recover(), 'unreachable')
    t.true(apply.notCalled)
    t.is(watcher.currentBuildTime, 'b1')
    t.is(states.at(-1), 'failed')

    // "Try again" on the notice
    t.true(await refresher.loadPending())
    t.true(apply.calledOnceWith('b2', 'data for b2'))
    t.is(states.at(-1), 'refreshed')
  }
)

test.serial(
  '#DataRefresher offers a newer build without loading it or hiding a failure',
  async (t) => {
    const fetch = stubFetch(t).resolves(buildInfo('b2'))
    const load = sinon.stub().resolves('data for b2')
    const { refresher, states } = createRefresher(load)

    await refresher.offerNewer()
    t.deepEqual(states, ['available'])
    t.true(load.notCalled)
    await refresher.loadPending()
    t.true(load.calledOnceWith('b2'))

    // A failed reload's notice stays until it is retried or dismissed
    fetch.resolves(buildInfo('b3'))
    load.rejects(new Error('offline'))
    await refresher.recover()
    t.is(states.at(-1), 'failed')
    fetch.resolves(buildInfo('b4'))
    await refresher.offerNewer()
    t.is(states.at(-1), 'failed')
  }
)
