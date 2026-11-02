import { MUSCLE_GROUPS, type Equipment, type Exercise, type FitDb, type MuscleGroup } from './db'

export interface ExerciseInput {
  name: string
  muscleGroup: MuscleGroup
  equipment: Equipment
}

const byName = (a: Exercise, b: Exercise) => a.name.localeCompare(b.name, 'es')

/** Lowercase and strip accents so "biceps" matches "Bíceps". */
export function normalizeName(text: string): string {
  return text.toLocaleLowerCase('es').normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

export function groupByMuscle(exercises: Exercise[]): [MuscleGroup, Exercise[]][] {
  return MUSCLE_GROUPS.map((g): [MuscleGroup, Exercise[]] => [g, exercises.filter((e) => e.muscleGroup === g)]).filter(
    ([, list]) => list.length > 0,
  )
}

export async function listExercises(db: FitDb, { includeHidden = false } = {}): Promise<Exercise[]> {
  const all = await db.exercises.toArray()
  return all.filter((e) => includeHidden || !e.hidden).sort(byName)
}

async function assertUniqueName(db: FitDb, name: string, ignoreId?: number): Promise<string> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('El nombre no puede estar vacío')
  const clash = await db.exercises
    .filter((e) => e.id !== ignoreId && normalizeName(e.name) === normalizeName(trimmed))
    .first()
  if (clash) throw new Error(`Ya existe un ejercicio llamado "${clash.name}"`)
  return trimmed
}

export async function createExercise(db: FitDb, input: ExerciseInput, now = Date.now()): Promise<number> {
  const name = await assertUniqueName(db, input.name)
  return db.exercises.add({ ...input, name, hidden: false, createdAt: now })
}

export async function updateExercise(db: FitDb, id: number, input: ExerciseInput): Promise<void> {
  const name = await assertUniqueName(db, input.name, id)
  await db.exercises.update(id, { ...input, name })
}

export async function setExerciseHidden(db: FitDb, id: number, hidden: boolean): Promise<void> {
  await db.exercises.update(id, { hidden })
}
