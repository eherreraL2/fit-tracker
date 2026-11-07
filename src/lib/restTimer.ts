import { useCallback, useEffect, useRef, useState } from 'react'

const STORAGE_KEY = 'fit-tracker:rest-timer'

export interface TimerState {
  endAt: number
  durationMs: number
}

/** Pure timer transitions, kept separate from React for testing. */
export function startTimer(now: number, seconds: number): TimerState {
  return { endAt: now + seconds * 1000, durationMs: seconds * 1000 }
}

export function adjustTimer(state: TimerState, now: number, deltaSeconds: number): TimerState | null {
  const endAt = state.endAt + deltaSeconds * 1000
  if (endAt <= now) return null
  return { endAt, durationMs: Math.max(state.durationMs + deltaSeconds * 1000, endAt - now) }
}

function load(): TimerState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as TimerState) : null
    return parsed && Number.isFinite(parsed.endAt) && Number.isFinite(parsed.durationMs) ? parsed : null
  } catch {
    return null
  }
}

function save(state: TimerState | null): void {
  try {
    if (state) localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage can be unavailable (private mode); the timer still works for this page view.
  }
}

/**
 * Rest countdown that survives tab switches and the app being suspended: it stores the end time,
 * not a running counter. `onFinish` fires once when the countdown reaches zero while the app is open.
 */
export function useRestTimer(onFinish: () => void) {
  const [state, setState] = useState<TimerState | null>(load)
  const [now, setNow] = useState(() => Date.now())
  const finishRef = useRef(onFinish)
  useEffect(() => {
    finishRef.current = onFinish
  }, [onFinish])

  // Functional updates so rapid taps (e.g. −15 three times) each apply to the latest state.
  const update = useCallback((next: (prev: TimerState | null) => TimerState | null) => {
    setState((prev) => {
      const value = next(prev)
      save(value)
      return value
    })
    setNow(Date.now())
  }, [])

  useEffect(() => {
    if (!state) return
    const tick = () => {
      const t = Date.now()
      setNow(t)
      if (t >= state.endAt) {
        update(() => null)
        finishRef.current()
      }
    }
    const id = window.setInterval(tick, 250)
    return () => window.clearInterval(id)
  }, [state, update])

  return {
    running: state !== null,
    remainingMs: state ? Math.max(0, state.endAt - now) : 0,
    progress: state ? Math.min(1, Math.max(0, 1 - (state.endAt - now) / state.durationMs)) : 0,
    start: (seconds: number) => update(() => startTimer(Date.now(), seconds)),
    adjust: (deltaSeconds: number) => update((prev) => prev && adjustTimer(prev, Date.now(), deltaSeconds)),
    skip: () => update(() => null),
  }
}
