import type { WorkSet } from '../db/db'

const kgFormat = new Intl.NumberFormat('es', { maximumFractionDigits: 2, useGrouping: false })
const dateFormat = new Intl.DateTimeFormat('es', { weekday: 'short', day: 'numeric', month: 'short' })
const timeFormat = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' })

export function formatKg(kg: number): string {
  return kgFormat.format(kg)
}

export function formatDate(ts: number): string {
  return dateFormat.format(ts)
}

export function formatTime(ts: number): string {
  return timeFormat.format(ts)
}

export function formatDuration(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60000))
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h > 0 ? `${h} h ${m} min` : `${m} min`
}

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

export function formatSet(set: Pick<WorkSet, 'weightKg' | 'reps'>): string {
  return `${formatKg(set.weightKg)} × ${set.reps}`
}

/** Parses user-typed numbers, accepting a comma as decimal separator. */
export function parseNumber(text: string): number {
  const normalized = text.trim().replace(',', '.')
  return normalized === '' ? Number.NaN : Number(normalized)
}
