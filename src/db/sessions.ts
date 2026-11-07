import type { Exercise, FitDb, Session, SessionExercise, WorkSet } from './db'

export interface SetInput {
  weightKg: number
  reps: number
  rir?: number | null
}

export interface LastPerformance {
  sessionId: number
  date: number
  sets: WorkSet[]
}

export interface SessionExerciseDetail {
  sessionExercise: SessionExercise
  exercise: Exercise
  sets: WorkSet[]
}

export interface SessionSummary {
  session: Session
  exerciseNames: string[]
  setCount: number
  volumeKg: number
}

export const MAX_WEIGHT_KG = 1000
export const MAX_REPS = 200
export const MAX_RIR = 10

export function isValidRir(rir: unknown): boolean {
  return rir === undefined || rir === null || (Number.isInteger(rir) && (rir as number) >= 0 && (rir as number) <= MAX_RIR)
}

export function validateSet({ weightKg, reps, rir = null }: SetInput): Required<SetInput> {
  if (!Number.isFinite(weightKg) || weightKg < 0 || weightKg > MAX_WEIGHT_KG) {
    throw new Error(`El peso debe estar entre 0 y ${MAX_WEIGHT_KG} kg`)
  }
  if (!Number.isInteger(reps) || reps < 1 || reps > MAX_REPS) {
    throw new Error(`Las repeticiones deben ser un entero entre 1 y ${MAX_REPS}`)
  }
  if (!isValidRir(rir)) throw new Error(`El RIR debe ser un entero entre 0 y ${MAX_RIR}`)
  return { weightKg: Math.round(weightKg * 100) / 100, reps, rir }
}

export function setVolume(sets: Pick<WorkSet, 'weightKg' | 'reps'>[]): number {
  return sets.reduce((sum, s) => sum + s.weightKg * s.reps, 0)
}

export async function getActiveSession(db: FitDb): Promise<Session | undefined> {
  return db.sessions.filter((s) => s.endedAt === null).first()
}

export async function startSession(db: FitDb, now = Date.now()): Promise<number> {
  return db.transaction('rw', db.sessions, async () => {
    const active = await getActiveSession(db)
    if (active) return active.id
    return db.sessions.add({ startedAt: now, endedAt: null })
  })
}

export async function addExerciseToSession(db: FitDb, sessionId: number, exerciseId: number): Promise<number> {
  return db.transaction('rw', db.sessionExercises, async () => {
    const existing = await db.sessionExercises.where({ sessionId }).toArray()
    const match = existing.find((se) => se.exerciseId === exerciseId)
    if (match) return match.id
    const order = existing.reduce((max, se) => Math.max(max, se.order), -1) + 1
    return db.sessionExercises.add({ sessionId, exerciseId, order })
  })
}

export async function removeSessionExercise(db: FitDb, sessionExerciseId: number): Promise<void> {
  await db.transaction('rw', db.sessionExercises, db.sets, async () => {
    await db.sets.where({ sessionExerciseId }).delete()
    await db.sessionExercises.delete(sessionExerciseId)
  })
}

export async function addSet(db: FitDb, sessionExerciseId: number, input: SetInput, now = Date.now()): Promise<number> {
  const { weightKg, reps, rir } = validateSet(input)
  return db.transaction('rw', db.sessionExercises, db.sets, async () => {
    const se = await db.sessionExercises.get(sessionExerciseId)
    if (!se) throw new Error('El ejercicio ya no forma parte de la sesión')
    const order = await db.sets.where({ sessionExerciseId }).count()
    return db.sets.add({
      sessionId: se.sessionId,
      sessionExerciseId,
      exerciseId: se.exerciseId,
      order,
      weightKg,
      reps,
      rir,
      createdAt: now,
    })
  })
}

export async function deleteSet(db: FitDb, setId: number): Promise<void> {
  await db.transaction('rw', db.sets, async () => {
    const target = await db.sets.get(setId)
    if (!target) return
    await db.sets.delete(setId)
    const rest = await db.sets.where({ sessionExerciseId: target.sessionExerciseId }).sortBy('order')
    await Promise.all(rest.map((s, i) => (s.order === i ? null : db.sets.update(s.id, { order: i }))))
  })
}

export async function deleteSession(db: FitDb, sessionId: number): Promise<void> {
  await db.transaction('rw', [db.sessions, db.sessionExercises, db.sets, db.healthSamples], async () => {
    await db.sets.where({ sessionId }).delete()
    await db.sessionExercises.where({ sessionId }).delete()
    await db.healthSamples.where({ sessionId }).delete()
    await db.sessions.delete(sessionId)
  })
}

/** Ends the session, dropping exercises with no sets. Returns false if the session was empty and got deleted. */
export async function finishSession(db: FitDb, sessionId: number, now = Date.now()): Promise<boolean> {
  return db.transaction('rw', [db.sessions, db.sessionExercises, db.sets, db.healthSamples], async () => {
    const sets = await db.sets.where({ sessionId }).toArray()
    if (sets.length === 0) {
      await deleteSession(db, sessionId)
      return false
    }
    const used = new Set(sets.map((s) => s.sessionExerciseId))
    await db.sessionExercises
      .where({ sessionId })
      .filter((se) => !used.has(se.id))
      .delete()
    await db.sessions.update(sessionId, { endedAt: now })
    return true
  })
}

/** Most recent previous session's sets for an exercise, ignoring `excludeSessionId` (the one in progress). */
export async function getLastPerformance(
  db: FitDb,
  exerciseId: number,
  excludeSessionId?: number,
): Promise<LastPerformance | null> {
  const latest = await db.sets
    .where('[exerciseId+createdAt]')
    .between([exerciseId, -Infinity], [exerciseId, Infinity])
    .reverse()
    .filter((s) => s.sessionId !== excludeSessionId)
    .first()
  if (!latest) return null
  const sets = await db.sets
    .where({ sessionId: latest.sessionId })
    .filter((s) => s.exerciseId === exerciseId)
    .sortBy('order')
  const session = await db.sessions.get(latest.sessionId)
  return { sessionId: latest.sessionId, date: session?.startedAt ?? latest.createdAt, sets }
}

export async function getSessionDetail(db: FitDb, sessionId: number): Promise<SessionExerciseDetail[]> {
  const [ses, sets] = await Promise.all([
    db.sessionExercises.where({ sessionId }).sortBy('order'),
    db.sets.where({ sessionId }).sortBy('order'),
  ])
  const exercises = await db.exercises.bulkGet(ses.map((se) => se.exerciseId))
  return ses.flatMap((sessionExercise, i) => {
    const exercise = exercises[i]
    if (!exercise) return []
    return [{ sessionExercise, exercise, sets: sets.filter((s) => s.sessionExerciseId === sessionExercise.id) }]
  })
}

export async function listFinishedSessions(db: FitDb): Promise<SessionSummary[]> {
  const sessions = (await db.sessions.orderBy('startedAt').reverse().toArray()).filter((s) => s.endedAt !== null)
  return Promise.all(
    sessions.map(async (session) => {
      const detail = await getSessionDetail(db, session.id)
      const sets = detail.flatMap((d) => d.sets)
      return {
        session,
        exerciseNames: detail.map((d) => d.exercise.name),
        setCount: sets.length,
        volumeKg: setVolume(sets),
      }
    }),
  )
}
