import type { HealthSampleType } from '../db/db'

/**
 * Plain-text format produced by the iOS Shortcut (one reading per line, `;`-separated so decimal commas are safe):
 *   hr;<start ISO 8601>;<bpm>
 *   kcal;<start ISO 8601>;<end ISO 8601>;<value>;<unit>
 * Any other line (headers, blanks) is ignored.
 */
export interface ParsedSample {
  type: HealthSampleType
  start: number
  end: number
  value: number
}

export interface ParseResult {
  samples: ParsedSample[]
  invalidLines: number
}

const KJ_PER_KCAL = 4.184

function parseValue(text: string | undefined): number {
  if (!text) return Number.NaN
  // Shortcuts may add a unit ("72 lpm") or use a decimal comma ("12,5").
  const match = text.trim().replace(',', '.').match(/^-?\d+(\.\d+)?/)
  return match ? Number(match[0]) : Number.NaN
}

function parseDate(text: string | undefined): number {
  return text ? Date.parse(text.trim()) : Number.NaN
}

function parseLine(fields: string[]): ParsedSample | null {
  const kind = fields[0].trim().toLowerCase()
  if (kind === 'hr') {
    const start = parseDate(fields[1])
    const value = parseValue(fields[2])
    if (!Number.isFinite(start) || !(value >= 25 && value <= 250)) return null
    return { type: 'hr', start, end: start, value }
  }
  if (kind === 'kcal') {
    const start = parseDate(fields[1])
    const end = parseDate(fields[2])
    let value = parseValue(fields[3])
    if (/kj/i.test(fields[4] ?? '')) value /= KJ_PER_KCAL
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || !(value >= 0 && value < 5000)) return null
    return { type: 'kcal', start, end, value }
  }
  return null
}

export function parseHealthText(text: string): ParseResult {
  const samples: ParsedSample[] = []
  let invalidLines = 0
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const fields = line.split(/[;\t]/)
    const kind = fields[0].trim().toLowerCase()
    if (kind !== 'hr' && kind !== 'kcal') continue
    const sample = parseLine(fields)
    if (sample) samples.push(sample)
    else invalidLines++
  }
  return { samples, invalidLines }
}
