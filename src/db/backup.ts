import {
  EQUIPMENT,
  MUSCLE_GROUPS,
  type Exercise,
  type FitDb,
  type HealthSample,
  type Session,
  type SessionExercise,
  type Template,
  type WorkSet,
} from './db'
import { isValidRir } from './sessions'

export const BACKUP_FORMAT = 1
const APP_ID = 'fit-tracker'
const LAST_BACKUP_KEY = 'lastBackupAt'
export const BACKUP_REMINDER_DAYS = 7

export interface Backup {
  app: typeof APP_ID
  format: typeof BACKUP_FORMAT
  exportedAt: number
  exercises: Exercise[]
  sessions: Session[]
  sessionExercises: SessionExercise[]
  sets: WorkSet[]
  /** Added in phase 3; older backups have none. */
  templates: Template[]
  /** Added in phase 5; older backups have none. */
  healthSamples: HealthSample[]
}

export async function buildBackup(db: FitDb, now = Date.now()): Promise<Backup> {
  const tables = [db.exercises, db.sessions, db.sessionExercises, db.sets, db.templates, db.healthSamples]
  return db.transaction('r', tables, async () => ({
    app: APP_ID,
    format: BACKUP_FORMAT,
    exportedAt: now,
    exercises: await db.exercises.toArray(),
    sessions: await db.sessions.toArray(),
    sessionExercises: await db.sessionExercises.toArray(),
    sets: await db.sets.toArray(),
    templates: await db.templates.toArray(),
    healthSamples: await db.healthSamples.toArray(),
  }))
}

export function backupFileName(exportedAt: number): string {
  const d = new Date(exportedAt)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `fit-tracker-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`
}

class BackupError extends Error {}

function fail(message: string): never {
  throw new BackupError(`Copia no válida: ${message}`)
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isId = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0
const isTime = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function records(raw: Record<string, unknown>, key: string, check: (r: Record<string, unknown>) => boolean) {
  const list = raw[key]
  if (!Array.isArray(list)) fail(`falta la lista "${key}"`)
  list.forEach((r, i) => {
    if (!isObject(r) || !check(r)) fail(`registro ${i + 1} de "${key}" mal formado`)
  })
  return list as Record<string, unknown>[]
}

function assertUniqueIds(list: { id: number }[], key: string): Set<number> {
  const ids = new Set(list.map((r) => r.id))
  if (ids.size !== list.length) fail(`ids repetidos en "${key}"`)
  return ids
}

/** Validates an untrusted parsed JSON value, including references between tables. */
export function parseBackup(raw: unknown): Backup {
  if (!isObject(raw) || raw.app !== APP_ID) fail('no es un archivo de Fit Tracker')
  if (raw.format !== BACKUP_FORMAT) fail(`formato ${String(raw.format)} no soportado`)
  if (!isTime(raw.exportedAt)) fail('fecha de exportación ausente')

  const exercises = records(
    raw,
    'exercises',
    (r) =>
      isId(r.id) &&
      typeof r.name === 'string' &&
      r.name.trim() !== '' &&
      (MUSCLE_GROUPS as readonly unknown[]).includes(r.muscleGroup) &&
      (EQUIPMENT as readonly unknown[]).includes(r.equipment) &&
      typeof r.hidden === 'boolean' &&
      isTime(r.createdAt),
  ) as unknown as Exercise[]
  const sessions = records(
    raw,
    'sessions',
    (r) => isId(r.id) && isTime(r.startedAt) && (r.endedAt === null || isTime(r.endedAt)),
  ) as unknown as Session[]
  const sessionExercises = records(
    raw,
    'sessionExercises',
    (r) => isId(r.id) && isId(r.sessionId) && isId(r.exerciseId) && Number.isInteger(r.order),
  ) as unknown as SessionExercise[]
  const sets = records(
    raw,
    'sets',
    (r) =>
      isId(r.id) &&
      isId(r.sessionId) &&
      isId(r.sessionExerciseId) &&
      isId(r.exerciseId) &&
      Number.isInteger(r.order) &&
      typeof r.weightKg === 'number' &&
      r.weightKg >= 0 &&
      Number.isInteger(r.reps) &&
      (r.reps as number) > 0 &&
      isValidRir(r.rir) &&
      isTime(r.createdAt),
  ) as unknown as WorkSet[]
  const templates = (
    raw.templates === undefined
      ? []
      : records(
          raw,
          'templates',
          (r) =>
            isId(r.id) &&
            typeof r.name === 'string' &&
            r.name.trim() !== '' &&
            Array.isArray(r.exerciseIds) &&
            r.exerciseIds.every(isId) &&
            isTime(r.createdAt) &&
            isTime(r.updatedAt),
        )
  ) as unknown as Template[]
  const healthSamples = (
    raw.healthSamples === undefined
      ? []
      : records(
          raw,
          'healthSamples',
          (r) =>
            isId(r.id) &&
            isId(r.sessionId) &&
            (r.type === 'hr' || r.type === 'kcal') &&
            isTime(r.start) &&
            isTime(r.end) &&
            typeof r.value === 'number' &&
            Number.isFinite(r.value),
        )
  ) as unknown as HealthSample[]

  const exerciseIds = assertUniqueIds(exercises, 'exercises')
  const sessionIds = assertUniqueIds(sessions, 'sessions')
  assertUniqueIds(sessionExercises, 'sessionExercises')
  assertUniqueIds(sets, 'sets')
  assertUniqueIds(templates, 'templates')
  assertUniqueIds(healthSamples, 'healthSamples')
  if (sessions.filter((s) => s.endedAt === null).length > 1) fail('hay más de una sesión en curso')

  const seById = new Map(sessionExercises.map((se) => [se.id, se]))
  for (const se of sessionExercises) {
    if (!sessionIds.has(se.sessionId) || !exerciseIds.has(se.exerciseId)) fail('referencias rotas en ejercicios de sesión')
  }
  for (const s of sets) {
    const se = seById.get(s.sessionExerciseId)
    if (!se || se.sessionId !== s.sessionId || se.exerciseId !== s.exerciseId) fail('referencias rotas en series')
  }
  if (templates.some((t) => t.exerciseIds.some((id) => !exerciseIds.has(id)))) fail('referencias rotas en plantillas')
  if (healthSamples.some((h) => !sessionIds.has(h.sessionId))) fail('referencias rotas en datos de salud')

  return {
    app: APP_ID,
    format: BACKUP_FORMAT,
    exportedAt: raw.exportedAt,
    exercises,
    sessions,
    sessionExercises,
    sets,
    templates,
    healthSamples,
  }
}

/** Replaces all workout data with the backup's contents. */
export async function restoreBackup(db: FitDb, backup: Backup): Promise<void> {
  const tables = [db.exercises, db.sessions, db.sessionExercises, db.sets, db.templates, db.healthSamples]
  await db.transaction('rw', [...tables, db.meta], async () => {
    await Promise.all(tables.map((t) => t.clear()))
    await db.exercises.bulkAdd(backup.exercises)
    await db.sessions.bulkAdd(backup.sessions)
    await db.sessionExercises.bulkAdd(backup.sessionExercises)
    await db.sets.bulkAdd(backup.sets)
    await db.templates.bulkAdd(backup.templates)
    await db.healthSamples.bulkAdd(backup.healthSamples)
    await db.meta.put({ key: LAST_BACKUP_KEY, value: backup.exportedAt })
  })
}

export async function getLastBackupAt(db: FitDb): Promise<number | null> {
  const entry = await db.meta.get(LAST_BACKUP_KEY)
  return isTime(entry?.value) ? entry.value : null
}

export async function markBackupDone(db: FitDb, at: number): Promise<void> {
  await db.meta.put({ key: LAST_BACKUP_KEY, value: at })
}

/** True when there is workout data newer than the last backup and that backup is old (or missing). */
export async function isBackupDue(db: FitDb, now = Date.now()): Promise<boolean> {
  const [last, latestSession] = await Promise.all([getLastBackupAt(db), db.sessions.orderBy('startedAt').last()])
  if (!latestSession) return false
  if (last === null) return true
  const hasNewData = latestSession.startedAt > last || (latestSession.endedAt ?? 0) > last
  return hasNewData && now - last > BACKUP_REMINDER_DAYS * 24 * 60 * 60 * 1000
}
