import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDb, type FitDb } from './db'
import { createExercise, listExercises, setExerciseHidden } from './exercises'
import { SEED_EXERCISES } from './seed'
import {
  addExerciseToSession,
  addSet,
  deleteSet,
  finishSession,
  getActiveSession,
  getLastPerformance,
  getSessionDetail,
  listFinishedSessions,
  removeSessionExercise,
  startSession,
  validateSet,
} from './sessions'

let db: FitDb
let dbName: string
let counter = 0

beforeEach(async () => {
  dbName = `fit-test-${++counter}`
  db = createDb(dbName)
  await db.open()
})

afterEach(async () => {
  db.close()
  await Dexie.delete(dbName)
})

async function exerciseId(name: string): Promise<number> {
  const found = await db.exercises.where({ name }).first()
  if (!found) throw new Error(`missing ${name}`)
  return found.id
}

describe('schema', () => {
  it('seeds the catalog on a fresh install', async () => {
    expect(await db.exercises.count()).toBe(SEED_EXERCISES.length)
  })

  it('seeds the catalog when upgrading a phase 0 (v1) database', async () => {
    db.close()
    await Dexie.delete(dbName)
    const v1 = new Dexie(dbName)
    v1.version(1).stores({ probes: '++id, createdAt' })
    await v1.table('probes').add({ note: 'old', createdAt: 1 })
    v1.close()

    db = createDb(dbName)
    await db.open()
    expect(await db.exercises.count()).toBe(SEED_EXERCISES.length)
  })
})

describe('exercises', () => {
  it('rejects duplicate names ignoring case and accents', async () => {
    await expect(createExercise(db, { name: 'press BANCA', muscleGroup: 'Pecho', equipment: 'Barra' })).rejects.toThrow(
      /Ya existe/,
    )
    await expect(createExercise(db, { name: 'Curl con mancuernas', muscleGroup: 'Bíceps', equipment: 'Barra' })).rejects.toThrow()
  })

  it('hides exercises from the default list', async () => {
    const id = await exerciseId('Plancha')
    await setExerciseHidden(db, id, true)
    expect((await listExercises(db)).some((e) => e.id === id)).toBe(false)
    expect((await listExercises(db, { includeHidden: true })).some((e) => e.id === id)).toBe(true)
  })
})

describe('sessions', () => {
  it('keeps a single active session', async () => {
    const a = await startSession(db, 1000)
    const b = await startSession(db, 2000)
    expect(b).toBe(a)
    expect((await getActiveSession(db))?.id).toBe(a)
  })

  it('does not duplicate an exercise within a session', async () => {
    const s = await startSession(db)
    const bench = await exerciseId('Press banca')
    const first = await addExerciseToSession(db, s, bench)
    expect(await addExerciseToSession(db, s, bench)).toBe(first)
  })

  it('validates sets', () => {
    expect(() => validateSet({ weightKg: -1, reps: 5 })).toThrow()
    expect(() => validateSet({ weightKg: 50, reps: 0 })).toThrow()
    expect(() => validateSet({ weightKg: 50, reps: 2.5 })).toThrow()
    expect(() => validateSet({ weightKg: Number.NaN, reps: 5 })).toThrow()
    expect(validateSet({ weightKg: 0, reps: 10 })).toEqual({ weightKg: 0, reps: 10, rir: null })
  })

  it('renumbers sets after deleting one', async () => {
    const s = await startSession(db)
    const se = await addExerciseToSession(db, s, await exerciseId('Sentadilla'))
    const ids = [
      await addSet(db, se, { weightKg: 60, reps: 5 }),
      await addSet(db, se, { weightKg: 70, reps: 5 }),
      await addSet(db, se, { weightKg: 80, reps: 5 }),
    ]
    await deleteSet(db, ids[1])
    const [detail] = await getSessionDetail(db, s)
    expect(detail.sets.map((x) => [x.weightKg, x.order])).toEqual([
      [60, 0],
      [80, 1],
    ])
  })

  it('finishing drops exercises without sets, and deletes an empty session', async () => {
    const s = await startSession(db, 1000)
    const bench = await addExerciseToSession(db, s, await exerciseId('Press banca'))
    await addExerciseToSession(db, s, await exerciseId('Dominadas'))
    await addSet(db, bench, { weightKg: 60, reps: 8 })
    expect(await finishSession(db, s, 5000)).toBe(true)
    const detail = await getSessionDetail(db, s)
    expect(detail.map((d) => d.exercise.name)).toEqual(['Press banca'])
    expect((await db.sessions.get(s))?.endedAt).toBe(5000)

    const empty = await startSession(db, 6000)
    await addExerciseToSession(db, empty, await exerciseId('Dominadas'))
    expect(await finishSession(db, empty)).toBe(false)
    expect(await db.sessions.get(empty)).toBeUndefined()
    expect(await db.sessionExercises.where({ sessionId: empty }).count()).toBe(0)
  })

  it('removing an exercise deletes its sets', async () => {
    const s = await startSession(db)
    const se = await addExerciseToSession(db, s, await exerciseId('Press banca'))
    await addSet(db, se, { weightKg: 60, reps: 8 })
    await removeSessionExercise(db, se)
    expect(await db.sets.where({ sessionId: s }).count()).toBe(0)
  })

  it('last performance returns the previous session, not the current one', async () => {
    const bench = await exerciseId('Press banca')

    const s1 = await startSession(db, 1000)
    const se1 = await addExerciseToSession(db, s1, bench)
    await addSet(db, se1, { weightKg: 60, reps: 8 }, 1100)
    await addSet(db, se1, { weightKg: 60, reps: 7 }, 1200)
    await finishSession(db, s1, 2000)

    const s2 = await startSession(db, 3000)
    expect(await getLastPerformance(db, bench, s2)).toMatchObject({
      sessionId: s1,
      date: 1000,
      sets: [{ weightKg: 60, reps: 8 }, { weightKg: 60, reps: 7 }],
    })

    const se2 = await addExerciseToSession(db, s2, bench)
    await addSet(db, se2, { weightKg: 62.5, reps: 8 }, 3100)
    expect((await getLastPerformance(db, bench, s2))?.sessionId).toBe(s1)
    expect((await getLastPerformance(db, bench))?.sessionId).toBe(s2)
    expect(await getLastPerformance(db, await exerciseId('Plancha'), s2)).toBeNull()
  })

  it('summarises finished sessions newest first', async () => {
    const bench = await exerciseId('Press banca')
    for (const start of [1000, 5000]) {
      const s = await startSession(db, start)
      const se = await addExerciseToSession(db, s, bench)
      await addSet(db, se, { weightKg: 50, reps: 10 })
      await addSet(db, se, { weightKg: 50, reps: 10 })
      await finishSession(db, s, start + 100)
    }
    await startSession(db, 9000) // active, must be excluded
    const summaries = await listFinishedSessions(db)
    expect(summaries.map((s) => s.session.startedAt)).toEqual([5000, 1000])
    expect(summaries[0]).toMatchObject({ setCount: 2, volumeKg: 1000, exerciseNames: ['Press banca'] })
  })
})
