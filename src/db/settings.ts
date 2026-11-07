import type { FitDb } from './db'

const REST_KEY = 'restSeconds'
export const DEFAULT_REST_SECONDS = 90
export const REST_OPTIONS = [60, 90, 120, 150, 180, 240] as const

export async function getRestSeconds(db: FitDb): Promise<number> {
  const entry = await db.meta.get(REST_KEY)
  const value = entry?.value
  return typeof value === 'number' && value > 0 ? value : DEFAULT_REST_SECONDS
}

export async function setRestSeconds(db: FitDb, seconds: number): Promise<void> {
  if (!Number.isInteger(seconds) || seconds < 15 || seconds > 900) throw new Error('Duración de descanso no válida')
  await db.meta.put({ key: REST_KEY, value: seconds })
}
