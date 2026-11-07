import { MUSCLE_GROUPS, type Exercise, type FitDb, type MuscleGroup, type WorkSet } from './db'

/** Epley is unreliable for high-rep sets, so those don't produce an estimate. */
export const E1RM_MAX_REPS = 12

type SetLike = Pick<WorkSet, 'weightKg' | 'reps'>

/** Estimated one-rep max (Epley). A single rep is its own 1RM. */
export function estimate1rm({ weightKg, reps }: SetLike): number | null {
  if (weightKg <= 0 || reps > E1RM_MAX_REPS) return null
  return reps === 1 ? weightKg : weightKg * (1 + reps / 30)
}

/** Exercises logged without load (e.g. pull-ups at bodyweight) are tracked by reps instead of kg. */
export function isBodyweightOnly(sets: SetLike[]): boolean {
  return sets.length > 0 && sets.every((s) => s.weightKg === 0)
}

export interface SessionPoint {
  sessionId: number
  date: number
  sets: WorkSet[]
  topWeightKg: number
  bestE1rm: number | null
  volumeKg: number
  maxReps: number
  totalReps: number
}

export interface Bests {
  weightKg: number
  e1rm: number
  reps: number
}

export interface ExerciseRecords {
  heaviest: { set: WorkSet; date: number } | null
  bestE1rm: { set: WorkSet; value: number; date: number } | null
  mostVolume: { volumeKg: number; date: number } | null
  mostReps: { set: WorkSet; date: number } | null
}

function summarize(sessionId: number, date: number, sets: WorkSet[]): SessionPoint {
  const e1rms = sets.map(estimate1rm).filter((v): v is number => v !== null)
  return {
    sessionId,
    date,
    sets,
    topWeightKg: Math.max(...sets.map((s) => s.weightKg)),
    bestE1rm: e1rms.length > 0 ? Math.max(...e1rms) : null,
    volumeKg: sets.reduce((sum, s) => sum + s.weightKg * s.reps, 0),
    maxReps: Math.max(...sets.map((s) => s.reps)),
    totalReps: sets.reduce((sum, s) => sum + s.reps, 0),
  }
}

/** One point per finished session in which the exercise was trained, oldest first. */
export async function getExerciseHistory(db: FitDb, exerciseId: number): Promise<SessionPoint[]> {
  const sets = await db.sets
    .where('[exerciseId+createdAt]')
    .between([exerciseId, -Infinity], [exerciseId, Infinity])
    .toArray()
  const bySession = new Map<number, WorkSet[]>()
  for (const s of sets) bySession.set(s.sessionId, [...(bySession.get(s.sessionId) ?? []), s])
  const sessions = await db.sessions.bulkGet([...bySession.keys()])
  return sessions
    .filter((s) => s !== undefined && s.endedAt !== null)
    .map((s) => summarize(s!.id, s!.startedAt, bySession.get(s!.id)!.sort((a, b) => a.order - b.order)))
    .sort((a, b) => a.date - b.date)
}

export function getRecords(history: SessionPoint[]): ExerciseRecords {
  const records: ExerciseRecords = { heaviest: null, bestE1rm: null, mostVolume: null, mostReps: null }
  for (const point of history) {
    for (const set of point.sets) {
      if (!records.heaviest || set.weightKg > records.heaviest.set.weightKg) records.heaviest = { set, date: point.date }
      const e1rm = estimate1rm(set)
      if (e1rm !== null && (!records.bestE1rm || e1rm > records.bestE1rm.value)) {
        records.bestE1rm = { set, value: e1rm, date: point.date }
      }
      if (!records.mostReps || set.reps > records.mostReps.set.reps) records.mostReps = { set, date: point.date }
    }
    if (!records.mostVolume || point.volumeKg > records.mostVolume.volumeKg) {
      records.mostVolume = { volumeKg: point.volumeKg, date: point.date }
    }
  }
  return records
}

/** Best weight / e1RM / reps across all sessions except `excludeSessionId`, or null with no history. */
export async function getPriorBests(db: FitDb, exerciseId: number, excludeSessionId: number): Promise<Bests | null> {
  const sets = await db.sets
    .where('[exerciseId+createdAt]')
    .between([exerciseId, -Infinity], [exerciseId, Infinity])
    .filter((s) => s.sessionId !== excludeSessionId)
    .toArray()
  if (sets.length === 0) return null
  return sets.reduce<Bests>(
    (b, s) => ({
      weightKg: Math.max(b.weightKg, s.weightKg),
      e1rm: Math.max(b.e1rm, estimate1rm(s) ?? 0),
      reps: Math.max(b.reps, s.reps),
    }),
    { weightKg: 0, e1rm: 0, reps: 0 },
  )
}

/**
 * Flags each of today's sets that beats every earlier set (previous sessions plus earlier sets today).
 * Loaded sets compete on weight or estimated 1RM; bodyweight sets on reps. No history means no PRs.
 */
export function markRecordSets(sets: SetLike[], prior: Bests | null): boolean[] {
  if (!prior) return sets.map(() => false)
  let best = { ...prior }
  return sets.map((s) => {
    const e1rm = estimate1rm(s) ?? 0
    const isRecord =
      s.weightKg > 0 ? s.weightKg > best.weightKg || e1rm > best.e1rm : best.weightKg === 0 && s.reps > best.reps
    best = { weightKg: Math.max(best.weightKg, s.weightKg), e1rm: Math.max(best.e1rm, e1rm), reps: Math.max(best.reps, s.reps) }
    return isRecord
  })
}

export interface TrainedExercise {
  exercise: Exercise
  sessionCount: number
  lastDate: number
}

/** Exercises with at least one finished session, most recently trained first. */
export async function listTrainedExercises(db: FitDb): Promise<TrainedExercise[]> {
  const [sessions, ses, exercises] = await Promise.all([
    db.sessions.toArray(),
    db.sessionExercises.toArray(),
    db.exercises.toArray(),
  ])
  const finished = new Map(sessions.filter((s) => s.endedAt !== null).map((s) => [s.id, s.startedAt]))
  const stats = new Map<number, { sessions: Set<number>; lastDate: number }>()
  for (const se of ses) {
    const date = finished.get(se.sessionId)
    if (date === undefined) continue
    const entry = stats.get(se.exerciseId) ?? { sessions: new Set<number>(), lastDate: 0 }
    entry.sessions.add(se.sessionId)
    entry.lastDate = Math.max(entry.lastDate, date)
    stats.set(se.exerciseId, entry)
  }
  return exercises
    .filter((e) => stats.has(e.id))
    .map((exercise) => {
      const { sessions: ids, lastDate } = stats.get(exercise.id)!
      return { exercise, sessionCount: ids.size, lastDate }
    })
    .sort((a, b) => b.lastDate - a.lastDate)
}

/** Local midnight of the Monday starting the week that contains `ts`. */
export function weekStart(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.getTime()
}

export function addWeeks(weekStartTs: number, weeks: number): number {
  const d = new Date(weekStartTs)
  d.setDate(d.getDate() + weeks * 7)
  return d.getTime()
}

export interface MuscleWeek {
  muscleGroup: MuscleGroup
  sets: number
  /** Mean weekly sets over the 4 weeks before this one. */
  previousAvg: number
}

/** Working sets per muscle group for the week starting at `start`, with a 4-week baseline. Includes the session in progress. */
export async function getWeeklyMuscleSets(db: FitDb, start: number): Promise<MuscleWeek[]> {
  const baselineStart = addWeeks(start, -4)
  const end = addWeeks(start, 1)
  const sessions = await db.sessions.where('startedAt').between(baselineStart, end, true, false).toArray()
  const sessionDates = new Map(sessions.map((s) => [s.id, s.startedAt]))
  const [sets, exercises] = await Promise.all([
    db.sets.where('sessionId').anyOf([...sessionDates.keys()]).toArray(),
    db.exercises.toArray(),
  ])
  const muscleOf = new Map(exercises.map((e) => [e.id, e.muscleGroup]))
  const current = new Map<MuscleGroup, number>()
  const baseline = new Map<MuscleGroup, number>()
  for (const s of sets) {
    const muscle = muscleOf.get(s.exerciseId)
    if (!muscle) continue
    const target = sessionDates.get(s.sessionId)! >= start ? current : baseline
    target.set(muscle, (target.get(muscle) ?? 0) + 1)
  }
  return MUSCLE_GROUPS.map((muscleGroup) => ({
    muscleGroup,
    sets: current.get(muscleGroup) ?? 0,
    previousAvg: (baseline.get(muscleGroup) ?? 0) / 4,
  })).filter((m) => m.sets > 0 || m.previousAvg > 0)
}

