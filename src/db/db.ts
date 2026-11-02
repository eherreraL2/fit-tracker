import Dexie, { type EntityTable } from 'dexie'

/** Phase 0 probe record: proves IndexedDB writes survive app restarts. */
export interface ProbeEntry {
  id: number
  note: string
  createdAt: number
}

export type FitDb = Dexie & {
  probes: EntityTable<ProbeEntry, 'id'>
}

export function createDb(name = 'fit-tracker'): FitDb {
  const db = new Dexie(name) as FitDb
  db.version(1).stores({
    probes: '++id, createdAt',
  })
  return db
}

export const db = createDb()
