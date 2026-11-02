import type { WorkSet } from '../db/db'

/** Suggests the next set: repeat today's previous set, else the same set number from last time. */
export function suggestNextSet(
  today: Pick<WorkSet, 'weightKg' | 'reps'>[],
  lastTime: Pick<WorkSet, 'weightKg' | 'reps'>[] | undefined,
): { weightKg: number; reps: number } | null {
  const previous = today.at(-1) ?? lastTime?.[today.length] ?? lastTime?.at(-1)
  return previous ? { weightKg: previous.weightKg, reps: previous.reps } : null
}
