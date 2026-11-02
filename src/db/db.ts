import Dexie, { type EntityTable, type Transaction } from 'dexie'
import { SEED_EXERCISES } from './seed'

export const MUSCLE_GROUPS = [
  'Pecho',
  'Espalda',
  'Hombros',
  'Bíceps',
  'Tríceps',
  'Antebrazos',
  'Cuádriceps',
  'Isquiotibiales',
  'Glúteos',
  'Gemelos',
  'Core',
] as const
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number]

export const EQUIPMENT = ['Barra', 'Mancuernas', 'Máquina', 'Polea', 'Peso corporal', 'Kettlebell', 'Otro'] as const
export type Equipment = (typeof EQUIPMENT)[number]

export interface Exercise {
  id: number
  name: string
  muscleGroup: MuscleGroup
  equipment: Equipment
  hidden: boolean
  createdAt: number
}

export interface Session {
  id: number
  startedAt: number
  /** null while the session is in progress. */
  endedAt: number | null
}

export interface SessionExercise {
  id: number
  sessionId: number
  exerciseId: number
  order: number
}

export interface WorkSet {
  id: number
  sessionId: number
  sessionExerciseId: number
  exerciseId: number
  order: number
  weightKg: number
  reps: number
  createdAt: number
}

export type FitDb = Dexie & {
  exercises: EntityTable<Exercise, 'id'>
  sessions: EntityTable<Session, 'id'>
  sessionExercises: EntityTable<SessionExercise, 'id'>
  sets: EntityTable<WorkSet, 'id'>
}

async function seedExercises(tx: Transaction): Promise<void> {
  const now = Date.now()
  await tx.table('exercises').bulkAdd(SEED_EXERCISES.map((e) => ({ ...e, hidden: false, createdAt: now })))
}

export function createDb(name = 'fit-tracker'): FitDb {
  const db = new Dexie(name) as FitDb
  db.version(1).stores({
    probes: '++id, createdAt',
  })
  db.version(2)
    .stores({
      probes: null,
      exercises: '++id, name, muscleGroup',
      sessions: '++id, startedAt, endedAt',
      sessionExercises: '++id, sessionId, exerciseId',
      sets: '++id, sessionId, sessionExerciseId, [exerciseId+createdAt]',
    })
    // Existing v1 installs don't fire `populate`, so seed during the upgrade too.
    .upgrade(seedExercises)
  db.on('populate', seedExercises)
  return db
}

export const db = createDb()
