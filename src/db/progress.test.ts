import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { niceTicks, nearestIndex } from '../lib/chart'
import { createDb, type FitDb } from './db'
import {
  addWeeks,
  estimate1rm,
  getExerciseHistory,
  getPriorBests,
  getRecords,
  getWeeklyMuscleSets,
  isBodyweightOnly,
  listTrainedExercises,
  markRecordSets,
  weekStart,
} from './progress'
import { addExerciseToSession, addSet, finishSession, startSession, type SetInput } from './sessions'

let db: FitDb
let dbName: string
let counter = 0

beforeEach(async () => {
  dbName = `fit-progress-${++counter}`
  db = createDb(dbName)
  await db.open()
})

afterEach(async () => {
  db.close()
  await Dexie.delete(dbName)
})

const idOf = async (name: string) => (await db.exercises.where({ name }).first())!.id

async function workout(start: number, entries: [string, SetInput[]][], finish = true): Promise<number> {
  const s = await startSession(db, start)
  for (const [name, sets] of entries) {
    const se = await addExerciseToSession(db, s, await idOf(name))
    for (const [i, set] of sets.entries()) await addSet(db, se, set, start + i)
  }
  if (finish) await finishSession(db, s, start + 1000)
  return s
}

describe('estimate1rm', () => {
  it('uses Epley and treats a single as its own max', () => {
    expect(estimate1rm({ weightKg: 100, reps: 1 })).toBe(100)
    expect(estimate1rm({ weightKg: 100, reps: 5 })).toBeCloseTo(116.67, 2)
  })

  it('skips high-rep and unloaded sets', () => {
    expect(estimate1rm({ weightKg: 50, reps: 15 })).toBeNull()
    expect(estimate1rm({ weightKg: 0, reps: 10 })).toBeNull()
  })
})

describe('exercise history and records', () => {
  it('summarises finished sessions oldest first, ignoring the active one', async () => {
    await workout(2000, [['Press banca', [{ weightKg: 65, reps: 5 }, { weightKg: 60, reps: 8 }]]])
    await workout(1000, [['Press banca', [{ weightKg: 60, reps: 8 }]]])
    await workout(3000, [['Press banca', [{ weightKg: 100, reps: 1 }]]], false)

    const history = await getExerciseHistory(db, await idOf('Press banca'))
    expect(history.map((p) => p.date)).toEqual([1000, 2000])
    expect(history[1]).toMatchObject({ topWeightKg: 65, volumeKg: 65 * 5 + 60 * 8, maxReps: 8, totalReps: 13 })
    expect(history[1].bestE1rm).toBeCloseTo(76, 5) // max(65×(1+5/30)=75.83, 60×(1+8/30)=76)
  })

  it('finds the heaviest set, best e1RM and biggest session', async () => {
    await workout(1000, [['Sentadilla', [{ weightKg: 100, reps: 5 }, { weightKg: 100, reps: 5 }]]])
    await workout(2000, [['Sentadilla', [{ weightKg: 110, reps: 1 }]]])
    const records = getRecords(await getExerciseHistory(db, await idOf('Sentadilla')))
    expect(records.heaviest?.set.weightKg).toBe(110)
    expect(records.bestE1rm?.value).toBeCloseTo(116.67, 2)
    expect(records.bestE1rm?.date).toBe(1000)
    expect(records.mostVolume).toEqual({ volumeKg: 1000, date: 1000 })
  })

  it('lists trained exercises by most recent session', async () => {
    await workout(1000, [['Press banca', [{ weightKg: 60, reps: 8 }]], ['Dominadas', [{ weightKg: 0, reps: 8 }]]])
    await workout(2000, [['Press banca', [{ weightKg: 60, reps: 8 }]]])
    const trained = await listTrainedExercises(db)
    expect(trained.map((t) => [t.exercise.name, t.sessionCount])).toEqual([
      ['Press banca', 2],
      ['Dominadas', 1],
    ])
  })

  it('detects bodyweight-only exercises', () => {
    expect(isBodyweightOnly([{ weightKg: 0, reps: 10 }])).toBe(true)
    expect(isBodyweightOnly([{ weightKg: 0, reps: 10 }, { weightKg: 10, reps: 5 }])).toBe(false)
    expect(isBodyweightOnly([])).toBe(false)
  })
})

describe('record detection during a session', () => {
  it('flags sets that beat previous sessions and earlier sets today', async () => {
    await workout(1000, [['Press banca', [{ weightKg: 60, reps: 8 }]]])
    const current = await workout(2000, [], false)
    const prior = await getPriorBests(db, await idOf('Press banca'), current)
    expect(prior).toMatchObject({ weightKg: 60, reps: 8 })

    const today = [
      { weightKg: 60, reps: 8 }, // equal: not a record
      { weightKg: 62.5, reps: 6 }, // heavier
      { weightKg: 62.5, reps: 6 }, // ties the set above
      { weightKg: 60, reps: 10 }, // better e1RM (80 vs 76)
    ]
    expect(markRecordSets(today, prior)).toEqual([false, true, false, true])
  })

  it('never flags a first-ever session', () => {
    expect(markRecordSets([{ weightKg: 60, reps: 8 }], null)).toEqual([false])
  })

  it('compares bodyweight sets by reps', () => {
    const prior = { weightKg: 0, e1rm: 0, reps: 8 }
    expect(markRecordSets([{ weightKg: 0, reps: 8 }, { weightKg: 0, reps: 9 }], prior)).toEqual([false, true])
  })
})

describe('weekly muscle sets', () => {
  it('counts sets for the week and averages the 4 previous weeks', async () => {
    const monday = weekStart(new Date(2026, 10, 4, 18).getTime()) // Wed 4 Nov 2026 → Mon 2 Nov
    expect(new Date(monday).getDay()).toBe(1)
    expect(new Date(monday).getDate()).toBe(2)

    await workout(monday + 3600_000, [['Press banca', [{ weightKg: 60, reps: 8 }, { weightKg: 60, reps: 8 }]]])
    await workout(addWeeks(monday, -1), [['Press banca', [{ weightKg: 60, reps: 8 }, { weightKg: 60, reps: 8 }]]])
    await workout(addWeeks(monday, -3), [['Fondos', [{ weightKg: 0, reps: 10 }, { weightKg: 0, reps: 10 }]]]) // Pecho too
    await workout(addWeeks(monday, -6), [['Press banca', [{ weightKg: 60, reps: 8 }]]]) // outside baseline
    await workout(addWeeks(monday, 1), [['Press banca', [{ weightKg: 60, reps: 8 }]]]) // next week
    await workout(monday + 2 * 86_400_000, [['Sentadilla', [{ weightKg: 100, reps: 5 }]]], false) // in progress counts

    const rows = await getWeeklyMuscleSets(db, monday)
    expect(rows).toEqual([
      { muscleGroup: 'Pecho', sets: 2, previousAvg: 1 },
      { muscleGroup: 'Cuádriceps', sets: 1, previousAvg: 0 },
    ])
  })
})

describe('chart helpers', () => {
  it('produces round ticks that cover the data', () => {
    expect(niceTicks(62, 81)).toEqual([60, 70, 80, 90])
    expect(niceTicks(0, 1000)).toEqual([0, 500, 1000])
    const narrow = niceTicks(57.5, 62.5)
    expect(narrow[0]).toBeLessThanOrEqual(57.5)
    expect(narrow.at(-1)).toBeGreaterThanOrEqual(62.5)
    expect(narrow.length).toBeLessThanOrEqual(6)
    const flat = niceTicks(60, 60)
    expect(flat[0]).toBeLessThan(60)
    expect(flat.at(-1)).toBeGreaterThan(60)
  })

  it('finds the nearest point', () => {
    expect(nearestIndex([0, 10, 20], 14)).toBe(1)
    expect(nearestIndex([0, 10, 20], 16)).toBe(2)
  })
})
