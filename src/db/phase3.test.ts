import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { adjustTimer, startTimer } from '../lib/restTimer'
import { buildBackup, parseBackup, restoreBackup } from './backup'
import { createDb, type FitDb } from './db'
import { addExerciseToSession, addSet, finishSession, getActiveSession, getSessionDetail, startSession, validateSet } from './sessions'
import { DEFAULT_REST_SECONDS, getRestSeconds, setRestSeconds } from './settings'
import {
  createTemplate,
  deleteTemplate,
  listTemplates,
  sessionExerciseIds,
  startSessionFromTemplate,
  updateTemplate,
} from './templates'

let db: FitDb
let dbName: string
let counter = 0

beforeEach(async () => {
  dbName = `fit-phase3-${++counter}`
  db = createDb(dbName)
  await db.open()
})

afterEach(async () => {
  db.close()
  await Dexie.delete(dbName)
})

const idOf = async (name: string) => (await db.exercises.where({ name }).first())!.id
const roundTrip = (value: unknown) => JSON.parse(JSON.stringify(value))

describe('RIR', () => {
  it('is optional and validated', () => {
    expect(validateSet({ weightKg: 60, reps: 8 })).toEqual({ weightKg: 60, reps: 8, rir: null })
    expect(validateSet({ weightKg: 60, reps: 8, rir: 2 }).rir).toBe(2)
    expect(() => validateSet({ weightKg: 60, reps: 8, rir: -1 })).toThrow(/RIR/)
    expect(() => validateSet({ weightKg: 60, reps: 8, rir: 1.5 })).toThrow(/RIR/)
  })

  it('is stored with the set and survives a backup round trip', async () => {
    const s = await startSession(db, 1000)
    const se = await addExerciseToSession(db, s, await idOf('Press banca'))
    await addSet(db, se, { weightKg: 60, reps: 8, rir: 2 })
    await addSet(db, se, { weightKg: 60, reps: 8 })
    await finishSession(db, s, 2000)

    const backup = parseBackup(roundTrip(await buildBackup(db)))
    await restoreBackup(db, backup)
    const [detail] = await getSessionDetail(db, s)
    expect(detail.sets.map((x) => x.rir)).toEqual([2, null])
  })

  it('rejects an invalid RIR in a backup', async () => {
    const s = await startSession(db, 1000)
    const se = await addExerciseToSession(db, s, await idOf('Press banca'))
    await addSet(db, se, { weightKg: 60, reps: 8 })
    const raw = roundTrip(await buildBackup(db))
    raw.sets[0].rir = 'mucho'
    expect(() => parseBackup(raw)).toThrow(/sets/)
  })
})

describe('templates', () => {
  it('creates, renames and deletes, rejecting duplicates and empty lists', async () => {
    const bench = await idOf('Press banca')
    const row = await idOf('Remo con barra')
    const id = await createTemplate(db, { name: ' Torso A ', exerciseIds: [bench, row, bench] }, 1000)
    expect(await listTemplates(db)).toMatchObject([{ name: 'Torso A', exerciseIds: [bench, row] }])

    await expect(createTemplate(db, { name: 'torso a', exerciseIds: [bench] })).rejects.toThrow(/Ya existe/)
    await expect(createTemplate(db, { name: 'Vacía', exerciseIds: [] })).rejects.toThrow(/al menos/)
    await expect(createTemplate(db, { name: 'Fantasma', exerciseIds: [9999] })).rejects.toThrow(/no existen/)

    await updateTemplate(db, id, { name: 'Torso A', exerciseIds: [row, bench] }, 2000)
    expect((await db.templates.get(id))?.exerciseIds).toEqual([row, bench])
    await deleteTemplate(db, id)
    expect(await listTemplates(db)).toEqual([])
  })

  it('starts a session with the template exercises in order', async () => {
    const ids = [await idOf('Sentadilla'), await idOf('Peso muerto rumano'), await idOf('Prensa')]
    const t = await createTemplate(db, { name: 'Pierna', exerciseIds: ids })
    const s = await startSessionFromTemplate(db, t, 5000)
    expect((await getActiveSession(db))?.id).toBe(s)
    expect(await sessionExerciseIds(db, s)).toEqual(ids)
    // Starting again while a session runs returns it untouched.
    expect(await startSessionFromTemplate(db, t)).toBe(s)
    expect(await sessionExerciseIds(db, s)).toEqual(ids)
  })

  it('is included in backups and validated', async () => {
    const bench = await idOf('Press banca')
    await createTemplate(db, { name: 'Pecho', exerciseIds: [bench] })
    const raw = roundTrip(await buildBackup(db))
    expect(parseBackup(raw).templates).toHaveLength(1)

    const broken = roundTrip(raw)
    broken.templates[0].exerciseIds = [9999]
    expect(() => parseBackup(broken)).toThrow(/plantillas/)

    const legacy = roundTrip(raw)
    delete legacy.templates
    expect(parseBackup(legacy).templates).toEqual([])
  })
})

describe('rest settings', () => {
  it('defaults to 90 s and persists changes', async () => {
    expect(await getRestSeconds(db)).toBe(DEFAULT_REST_SECONDS)
    await setRestSeconds(db, 120)
    expect(await getRestSeconds(db)).toBe(120)
    await expect(setRestSeconds(db, 5)).rejects.toThrow()
  })
})

describe('rest timer', () => {
  it('starts and adjusts from the stored end time', () => {
    const t = startTimer(1000, 90)
    expect(t).toEqual({ endAt: 91_000, durationMs: 90_000 })
    expect(adjustTimer(t, 1000, 15)).toEqual({ endAt: 106_000, durationMs: 105_000 })
    expect(adjustTimer(t, 1000, -15)).toEqual({ endAt: 76_000, durationMs: 75_000 })
  })

  it('ends when adjusted past now', () => {
    expect(adjustTimer(startTimer(0, 90), 80_000, -15)).toBeNull()
  })
})
