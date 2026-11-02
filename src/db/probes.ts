import type { FitDb, ProbeEntry } from './db'

export async function addProbe(db: FitDb, note: string, now = Date.now()): Promise<number> {
  const trimmed = note.trim()
  if (!trimmed) throw new Error('La nota no puede estar vacía')
  return db.probes.add({ note: trimmed, createdAt: now })
}

export function listProbes(db: FitDb): Promise<ProbeEntry[]> {
  return db.probes.orderBy('createdAt').reverse().toArray()
}

export function clearProbes(db: FitDb): Promise<void> {
  return db.probes.clear()
}
