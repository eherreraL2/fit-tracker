import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { createDb } from './db'
import { addProbe, clearProbes, listProbes } from './probes'

const db = createDb('fit-tracker-test')

afterEach(async () => {
  await clearProbes(db)
})

describe('probes', () => {
  it('stores trimmed notes and lists newest first', async () => {
    await addProbe(db, '  primera  ', 1000)
    await addProbe(db, 'segunda', 2000)
    const entries = await listProbes(db)
    expect(entries.map((e) => e.note)).toEqual(['segunda', 'primera'])
  })

  it('rejects empty notes', async () => {
    await expect(addProbe(db, '   ')).rejects.toThrow()
    expect(await listProbes(db)).toHaveLength(0)
  })

  it('persists across a reopened connection', async () => {
    await addProbe(db, 'persistente', 3000)
    db.close()
    const reopened = createDb('fit-tracker-test')
    expect((await listProbes(reopened)).map((e) => e.note)).toEqual(['persistente'])
    reopened.close()
    await db.open()
  })
})
