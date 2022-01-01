import anyTest, { TestInterface } from 'ava'
import { knex, Knex } from 'knex'
import { createTables, insertCategory } from './database'

const test = anyTest as TestInterface<{ db: Knex }>

test.beforeEach(async (t) => {
  const db = knex({
    client: 'sqlite3',
    connection: ':memory:',
    useNullAsDefault: true
  })
  await createTables(db)
  t.context = {
    db
  }
})

test('#insertCategory', async (t) => {
  const { db } = t.context
  await insertCategory(db, 'category1')
  const count = await db('Categories').count('* as total').first()
  t.is(count.total, 1)

  const first = await db('Categories').first()
  t.is(first.name, 'category1')
})
