import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { backupFileName, buildBackup, getLastBackupAt, isBackupDue, markBackupDone, parseBackup, restoreBackup } from './backup'
import { createDb, type FitDb } from './db'
import { createExercise } from './exercises'
import { addExerciseToSession, addSet, finishSession, getSessionDetail, startSession } from './sessions'

const DAY = 24 * 60 * 60 * 1000
let db: FitDb
let dbName: string
let counter = 0

beforeEach(async () => {
  dbName = `fit-backup-${++counter}`
  db = createDb(dbName)
  await db.open()
})

afterEach(async () => {
  db.close()
  await Dexie.delete(dbName)
})

async function logWorkout(start: number): Promise<number> {
  const bench = (await db.exercises.where({ name: 'Press banca' }).first())!.id
  const s = await startSession(db, start)
  const se = await addExerciseToSession(db, s, bench)
  await addSet(db, se, { weightKg: 60, reps: 8 }, start + 10)
  await addSet(db, se, { weightKg: 62.5, reps: 6 }, start + 20)
  await finishSession(db, s, start + 100)
  return s
}

/** Simulates writing the file and reading it back. */
const roundTrip = (value: unknown) => JSON.parse(JSON.stringify(value))

describe('backup round trip', () => {
  it('restores the exact data into an empty database', async () => {
    const s = await logWorkout(1000)
    await createExercise(db, { name: 'Remo Pendlay', muscleGroup: 'Espalda', equipment: 'Barra' })
    const backup = await buildBackup(db, 5000)

    const otherName = `${dbName}-restore`
    const other = createDb(otherName)
    await other.open()
    await restoreBackup(other, parseBackup(roundTrip(backup)))

    expect(await buildBackup(other, 5000)).toEqual(backup)
    expect((await getSessionDetail(other, s))[0].sets.map((x) => x.weightKg)).toEqual([60, 62.5])
    expect(await getLastBackupAt(other)).toBe(5000)
    other.close()
    await Dexie.delete(otherName)
  })

  it('replaces existing data instead of merging', async () => {
    await logWorkout(1000)
    const backup = roundTrip(await buildBackup(db, 2000))
    await logWorkout(3000)
    expect(await db.sessions.count()).toBe(2)
    await restoreBackup(db, parseBackup(backup))
    expect(await db.sessions.count()).toBe(1)
  })
})

describe('parseBackup', () => {
  async function validBackup() {
    await logWorkout(1000)
    return roundTrip(await buildBackup(db, 2000))
  }

  it('rejects files from other apps or formats', () => {
    expect(() => parseBackup({ app: 'otra' })).toThrow(/no es un archivo/)
    expect(() => parseBackup(null)).toThrow()
    expect(() => parseBackup({ app: 'fit-tracker', format: 99, exportedAt: 1 })).toThrow(/formato/)
  })

  it('rejects malformed records', async () => {
    const b = await validBackup()
    b.sets[0].reps = 0
    expect(() => parseBackup(b)).toThrow(/series|sets/)
  })

  it('rejects broken references', async () => {
    const b = await validBackup()
    b.sets[0].sessionExerciseId = 999
    expect(() => parseBackup(b)).toThrow(/referencias/)
    const c = await validBackup()
    c.exercises = c.exercises.filter((e: { name: string }) => e.name !== 'Press banca')
    expect(() => parseBackup(c)).toThrow(/referencias/)
  })

  it('rejects duplicate ids', async () => {
    const b = await validBackup()
    b.sets.push({ ...b.sets[0] })
    expect(() => parseBackup(b)).toThrow(/repetidos/)
  })
})

describe('backup reminder', () => {
  it('is not due without workouts', async () => {
    expect(await isBackupDue(db)).toBe(false)
  })

  it('is due after the first workout with no backup', async () => {
    await logWorkout(1000)
    expect(await isBackupDue(db, 2000)).toBe(true)
  })

  it('is due only when there is new data and the last backup is old', async () => {
    await logWorkout(1000)
    await markBackupDone(db, 2000)
    expect(await isBackupDue(db, 2000 + 30 * DAY)).toBe(false) // nothing new since backup
    await logWorkout(2000 + DAY)
    expect(await isBackupDue(db, 2000 + 3 * DAY)).toBe(false) // backup is recent
    expect(await isBackupDue(db, 2000 + 8 * DAY)).toBe(true)
  })
})

it('names files by date', () => {
  expect(backupFileName(new Date(2026, 10, 2, 15).getTime())).toBe('fit-tracker-2026-11-02.json')
})
