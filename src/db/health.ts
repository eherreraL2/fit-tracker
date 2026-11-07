import type { ParsedSample } from '../lib/healthText'
import type { FitDb, HealthSample, Session, WorkSet } from './db'

/** Readings this close to a session's start/end still count as part of it (warm-up, logging lag). */
export const SESSION_MARGIN_MS = 2 * 60 * 1000
/** Heart-rate data is "dense" enough for a per-session chart when readings are at most this far apart. */
export const DENSE_GAP_MS = 90 * 1000
const LAST_IMPORT_KEY = 'lastHealthImportAt'

export interface ImportSummary {
  added: number
  duplicates: number
  outsideSessions: number
  sessionIds: number[]
}

function sessionWindow(session: Session, now: number): [number, number] {
  return [session.startedAt - SESSION_MARGIN_MS, (session.endedAt ?? now) + SESSION_MARGIN_MS]
}

/** Energy readings can span longer than a session; keep only the share that overlaps it. */
function overlapShare(sample: ParsedSample, [from, to]: [number, number]): number {
  if (sample.end <= sample.start) return sample.start >= from && sample.start <= to ? 1 : 0
  const overlap = Math.min(sample.end, to) - Math.max(sample.start, from)
  return Math.max(0, overlap) / (sample.end - sample.start)
}

/** Attaches readings to the session they fall in; readings outside every session are dropped. Re-importing is safe. */
export async function importHealthSamples(db: FitDb, samples: ParsedSample[], now = Date.now()): Promise<ImportSummary> {
  return db.transaction('rw', db.sessions, db.healthSamples, db.meta, async () => {
    const sessions = await db.sessions.toArray()
    const windows = sessions.map((s) => ({ id: s.id, window: sessionWindow(s, now) }))
    const existing = await db.healthSamples.where('sessionId').anyOf(windows.map((w) => w.id)).toArray()
    const seen = new Set(existing.map((s) => `${s.type}:${s.start}:${s.end}`))

    const toAdd: Omit<HealthSample, 'id'>[] = []
    let duplicates = 0
    let outsideSessions = 0
    for (const sample of samples) {
      const match = windows
        .map((w) => ({ ...w, share: overlapShare(sample, w.window) }))
        .filter((w) => w.share > 0)
        .sort((a, b) => b.share - a.share)[0]
      if (!match) {
        outsideSessions++
        continue
      }
      const key = `${sample.type}:${sample.start}:${sample.end}`
      if (seen.has(key)) {
        duplicates++
        continue
      }
      seen.add(key)
      const value = sample.type === 'kcal' ? sample.value * match.share : sample.value
      toAdd.push({ sessionId: match.id, type: sample.type, start: sample.start, end: sample.end, value })
    }

    await db.healthSamples.bulkAdd(toAdd)
    await db.meta.put({ key: LAST_IMPORT_KEY, value: now })
    return {
      added: toAdd.length,
      duplicates,
      outsideSessions,
      sessionIds: [...new Set(toAdd.map((s) => s.sessionId))],
    }
  })
}

export async function getLastHealthImportAt(db: FitDb): Promise<number | null> {
  const value = (await db.meta.get(LAST_IMPORT_KEY))?.value
  return typeof value === 'number' ? value : null
}

export interface SessionHealth {
  heartRate: { at: number; bpm: number }[]
  avgBpm: number | null
  maxBpm: number | null
  kcal: number | null
  /** True when readings are frequent enough to chart and to attribute a peak to each set. */
  dense: boolean
}

function medianGap(times: number[]): number {
  if (times.length < 2) return Infinity
  const gaps = times.slice(1).map((t, i) => t - times[i]).sort((a, b) => a - b)
  return gaps[Math.floor(gaps.length / 2)]
}

export function summarizeHealth(samples: Pick<HealthSample, 'type' | 'start' | 'value'>[]): SessionHealth {
  const heartRate = samples
    .filter((s) => s.type === 'hr')
    .map((s) => ({ at: s.start, bpm: s.value }))
    .sort((a, b) => a.at - b.at)
  const energy = samples.filter((s) => s.type === 'kcal')
  const bpms = heartRate.map((h) => h.bpm)
  return {
    heartRate,
    avgBpm: bpms.length > 0 ? Math.round(bpms.reduce((a, b) => a + b, 0) / bpms.length) : null,
    maxBpm: bpms.length > 0 ? Math.max(...bpms) : null,
    kcal: energy.length > 0 ? Math.round(energy.reduce((sum, s) => sum + s.value, 0)) : null,
    dense: heartRate.length >= 6 && medianGap(heartRate.map((h) => h.at)) <= DENSE_GAP_MS,
  }
}

export async function getSessionHealth(db: FitDb, sessionId: number): Promise<SessionHealth> {
  return summarizeHealth(await db.healthSamples.where({ sessionId }).toArray())
}

/**
 * Highest heart rate around each set, keyed by set id: from the previous set logged in the session
 * (any exercise, or 3 min before for the first) until 30 s after this one was logged.
 */
export function setPeaks(
  sets: Pick<WorkSet, 'id' | 'createdAt'>[],
  heartRate: { at: number; bpm: number }[],
): Map<number, number> {
  const ordered = [...sets].sort((a, b) => a.createdAt - b.createdAt)
  const peaks = new Map<number, number>()
  ordered.forEach((set, i) => {
    const from = i > 0 ? ordered[i - 1].createdAt : set.createdAt - 3 * 60 * 1000
    const to = set.createdAt + 30 * 1000
    const inWindow = heartRate.filter((h) => h.at > from && h.at <= to).map((h) => h.bpm)
    if (inWindow.length > 0) peaks.set(set.id, Math.max(...inWindow))
  })
  return peaks
}
