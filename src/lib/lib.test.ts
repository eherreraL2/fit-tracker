import { describe, expect, it } from 'vitest'
import { formatElapsed, formatKg, parseNumber } from './format'
import { suggestNextSet } from './suggest'

describe('parseNumber', () => {
  it('accepts comma and dot decimals', () => {
    expect(parseNumber('62,5')).toBe(62.5)
    expect(parseNumber(' 62.5 ')).toBe(62.5)
    expect(parseNumber('')).toBeNaN()
    expect(parseNumber('abc')).toBeNaN()
  })

  it('round-trips formatKg output', () => {
    expect(parseNumber(formatKg(1000))).toBe(1000)
    expect(parseNumber(formatKg(102.5))).toBe(102.5)
  })
})

describe('formatElapsed', () => {
  it('formats minutes and hours', () => {
    expect(formatElapsed(65_000)).toBe('1:05')
    expect(formatElapsed(3_725_000)).toBe('1:02:05')
  })
})

describe('suggestNextSet', () => {
  const last = [
    { weightKg: 60, reps: 8 },
    { weightKg: 65, reps: 6 },
  ]

  it('repeats today’s previous set first', () => {
    expect(suggestNextSet([{ weightKg: 70, reps: 5 }], last)).toEqual({ weightKg: 70, reps: 5 })
  })

  it('falls back to the same set number from last time, then the last one', () => {
    expect(suggestNextSet([], last)).toEqual({ weightKg: 60, reps: 8 })
    expect(suggestNextSet([{ weightKg: 60, reps: 8 }, { weightKg: 65, reps: 6 }], last)).toEqual({ weightKg: 65, reps: 6 })
  })

  it('returns null with no history', () => {
    expect(suggestNextSet([], undefined)).toBeNull()
  })
})
