import test from 'ava'
import sinon from 'sinon'
import { getStorage, openStorage } from './index'

test.serial(
  '#openStorage starts a fresh storage for a new build and tags its requests with the build',
  async (t) => {
    const fetch = sinon
      .stub(globalThis, 'fetch')
      .resolves({ status: 200, json: async () => [] } as unknown as Response)
    t.teardown(() => fetch.restore())

    const first = openStorage('/base', '2026-10-09T08:00:00.000Z')
    t.is(openStorage('/base', '2026-10-09T08:00:00.000Z'), first)
    await first.getCategories()
    t.is(
      fetch.lastCall.args[0],
      '/base/data/categories.json?v=2026-10-09T08%3A00%3A00.000Z'
    )

    const second = openStorage('/base', '2026-10-09T10:00:00.000Z')
    t.not(second, first)
    // Lists and articles pick up the new build's storage
    t.is(getStorage('/base'), second)
    await second.getCategories()
    t.is(
      fetch.lastCall.args[0],
      '/base/data/categories.json?v=2026-10-09T10%3A00%3A00.000Z'
    )
  }
)
