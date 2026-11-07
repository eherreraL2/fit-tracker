import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseHealthText } from '../lib/healthText'
import { buildBackup, parseBackup, restoreBackup } from './backup'
import { createDb, type FitDb } from './db'
import { getSessionHealth, importHealthSamples, setPeaks, summarizeHealth } from './health'
import { addExerciseToSession, addSet, deleteSession, finishSession, startSession } from './sessions'

let db: FitDb
let dbName: string
let counter = 0

beforeEach(async () => {
  dbName = `fit-health-${++counter}`
  db = createDb(dbName)
  await db.open()
})

afterEach(async () => {
  db.close()
  await Dexie.delete(dbName)
})

const T0 = Date.parse('2026-11-06T18:00:00-03:00')
const MIN = 60_000
const iso = (ms: number) => new Date(ms).toISOString()

async function session(start: number, end: number): Promise<number> {
  const s = await startSession(db, start)
  const bench = (await db.exercises.where({ name: 'Press banca' }).first())!.id
  const se = await addExerciseToSession(db, s, bench)
  await addSet(db, se, { weightKg: 60, reps: 8 }, start + 5 * MIN)
  await finishSession(db, s, end)
  return s
}

describe('parseHealthText', () => {
  it('reads heart rate and energy lines as produced by the Shortcut', () => {
    const text = [
      'FITTRACKER-HEALTH 1',
      'hr;2026-11-06T18:05:00-03:00;98',
      'hr;2026-11-06T18:06:00-03:00;121 lpm',
      'kcal;2026-11-06T18:00:00-03:00;2026-11-06T18:30:00-03:00;150,5;kcal',
      'kcal;2026-11-06T18:30:00-03:00;2026-11-06T19:00:00-03:00;418,4;kJ',
      '',
    ].join('\n')
    const { samples, invalidLines } = parseHealthText(text)
    expect(invalidLines).toBe(0)
    expect(samples).toEqual([
      { type: 'hr', start: T0 + 5 * MIN, end: T0 + 5 * MIN, value: 98 },
      { type: 'hr', start: T0 + 6 * MIN, end: T0 + 6 * MIN, value: 121 },
      { type: 'kcal', start: T0, end: T0 + 30 * MIN, value: 150.5 },
      { type: 'kcal', start: T0 + 30 * MIN, end: T0 + 60 * MIN, value: expect.closeTo(100, 6) },
    ])
  })

  it('counts unreadable data lines and skips unrelated text', () => {
    const { samples, invalidLines } = parseHealthText('hola\nhr;no-es-fecha;80\nhr;2026-11-06T18:05:00Z;999\nhr;2026-11-06T18:05:00Z;80')
    expect(samples).toHaveLength(1)
    expect(invalidLines).toBe(2)
  })
})

describe('importHealthSamples', () => {
  it('attaches readings to the session they fall in and drops the rest', async () => {
    const s1 = await session(T0, T0 + 60 * MIN)
    const s2 = await session(T0 + 24 * 60 * MIN, T0 + 25 * 60 * MIN)
    const { samples } = parseHealthText(
      [
        `hr;${iso(T0 - 1 * MIN)};90`, // inside the 2-min margin before s1
        `hr;${iso(T0 + 30 * MIN)};130`,
        `hr;${iso(T0 + 3 * 60 * MIN)};70`, // between sessions: dropped
        `hr;${iso(T0 + 24 * 60 * MIN + 10 * MIN)};140`,
      ].join('\n'),
    )
    const result = await importHealthSamples(db, samples, T0 + 26 * 60 * MIN)
    expect(result).toMatchObject({ added: 3, outsideSessions: 1, duplicates: 0 })
    expect(result.sessionIds.sort()).toEqual([s1, s2].sort())
    expect((await getSessionHealth(db, s1)).avgBpm).toBe(110)

    // Importing the same text again adds nothing.
    expect(await importHealthSamples(db, samples)).toMatchObject({ added: 0, duplicates: 3 })
  })

  it('keeps only the share of an energy reading that overlaps the session', async () => {
    const s = await session(T0, T0 + 30 * MIN)
    // 60 kcal over an hour that starts with the session: 30 min + 2 min margin overlap = 32/60.
    const { samples } = parseHealthText(`kcal;${iso(T0)};${iso(T0 + 60 * MIN)};60;kcal`)
    await importHealthSamples(db, samples)
    expect((await getSessionHealth(db, s)).kcal).toBe(32)
  })

  it('is removed with its session and survives a backup round trip', async () => {
    const s = await session(T0, T0 + 30 * MIN)
    await importHealthSamples(db, parseHealthText(`hr;${iso(T0 + 10 * MIN)};120`).samples)
    const backup = parseBackup(JSON.parse(JSON.stringify(await buildBackup(db))))
    expect(backup.healthSamples).toHaveLength(1)
    await restoreBackup(db, backup)
    expect((await getSessionHealth(db, s)).maxBpm).toBe(120)

    await deleteSession(db, s)
    expect(await db.healthSamples.count()).toBe(0)
  })
})

describe('summaries', () => {
  const hr = (minutes: number[], bpm = 100) => minutes.map((m) => ({ type: 'hr' as const, start: T0 + m * MIN, value: bpm }))

  it('marks frequent readings as dense, sparse ones not', () => {
    expect(summarizeHealth(hr([0, 1, 2, 3, 4, 5])).dense).toBe(true)
    expect(summarizeHealth(hr([0, 10, 20, 30, 40, 50])).dense).toBe(false)
    expect(summarizeHealth(hr([0, 1])).dense).toBe(false)
    expect(summarizeHealth([])).toMatchObject({ avgBpm: null, maxBpm: null, kcal: null })
  })

  it('finds the peak around each set using all sets in time order', () => {
    const heartRate = [
      { at: T0 + 1 * MIN, bpm: 110 },
      { at: T0 + 2 * MIN, bpm: 150 },
      { at: T0 + 4 * MIN, bpm: 100 },
      { at: T0 + 5 * MIN, bpm: 140 },
    ]
    const sets = [
      { id: 2, createdAt: T0 + 5 * MIN }, // listed out of order on purpose
      { id: 1, createdAt: T0 + 2 * MIN },
      { id: 3, createdAt: T0 + 20 * MIN },
    ]
    const peaks = setPeaks(sets, heartRate)
    expect(peaks.get(1)).toBe(150)
    expect(peaks.get(2)).toBe(140)
    expect(peaks.has(3)).toBe(false)
  })
})
