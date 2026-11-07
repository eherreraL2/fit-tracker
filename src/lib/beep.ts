let ctx: AudioContext | null = null

/** Must run inside a tap handler: iOS only lets audio start from a user gesture. */
export function unlockAudio(): void {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
  } catch {
    ctx = null
  }
}

/** Three short tones. Silent if audio was never unlocked or the iPhone is in silent mode. */
export function beep(): void {
  if (!ctx || ctx.state !== 'running') return
  const start = ctx.currentTime
  for (let i = 0; i < 3; i++) {
    const t = start + i * 0.25
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = i === 2 ? 1320 : 880
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.4, t + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.2)
  }
}
