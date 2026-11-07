/** Round tick values ("nice numbers") covering [min, max], roughly `count` of them. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return []
  if (min === max) {
    const pad = Math.max(1, Math.abs(min) * 0.1)
    min -= pad
    max += pad
  }
  const rawStep = (max - min) / Math.max(1, count - 1)
  const magnitude = 10 ** Math.floor(Math.log10(rawStep))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rawStep) ?? 10 * magnitude
  const start = Math.floor(min / step) * step
  const end = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6)
  return ticks
}

/** Index of the point whose x is closest to `x` (points sorted by x). */
export function nearestIndex(xs: number[], x: number): number {
  let best = 0
  for (let i = 1; i < xs.length; i++) {
    if (Math.abs(xs[i] - x) < Math.abs(xs[best] - x)) best = i
  }
  return best
}
