import test from 'ava'
import sinon from 'sinon'
import { createStorage, getStorage, openStorage, setStorage } from './index'

test.serial(
  '#openStorage tags requests with the page build, and a newer build installed later stays in place',
  async (t) => {
    const fetch = sinon
      .stub(globalThis, 'fetch')
      .resolves({ status: 200, json: async () => [] } as unknown as Response)
    t.teardown(() => fetch.restore())

    const first = openStorage('/base', '2026-10-09T08:00:00.000Z')
    await first.getCategories()
    t.is(
      fetch.lastCall.args[0],
      '/base/data/categories.json?v=2026-10-09T08%3A00%3A00.000Z'
    )

    const second = createStorage('/base', '2026-10-09T10:00:00.000Z')
    t.not(second, first)
    // Creating a storage for a newer build changes nothing until it is set
    t.is(getStorage('/base'), first)
    setStorage('2026-10-09T10:00:00.000Z', second)
    t.is(getStorage('/base'), second)

    // A late first-load effect for the old build does not bring it back
    t.is(openStorage('/base', '2026-10-09T08:00:00.000Z'), second)
    await getStorage('/base').getCategories()
    t.is(
      fetch.lastCall.args[0],
      '/base/data/categories.json?v=2026-10-09T10%3A00%3A00.000Z'
    )
  }
)
