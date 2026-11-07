import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useState } from 'react'
import { db } from '../db/db'
import { DEFAULT_REST_SECONDS, getRestSeconds } from '../db/settings'
import { beep, unlockAudio } from '../lib/beep'
import { formatElapsed } from '../lib/format'
import { useRestTimer } from '../lib/restTimer'

/** The "done" banner stays until tapped, up to this long, so a glance away doesn't miss it. */
const FLASH_MS = 60_000

/** Manual rest timer docked above the tab bar during a session. */
export function RestTimer() {
  const restSeconds = useLiveQuery(() => getRestSeconds(db), []) ?? DEFAULT_REST_SECONDS
  const [finishedAt, setFinishedAt] = useState<number | null>(null)

  const onFinish = useCallback(() => {
    beep()
    setFinishedAt(Date.now())
  }, [])
  const timer = useRestTimer(onFinish)

  useEffect(() => {
    if (finishedAt === null) return
    const id = window.setTimeout(() => setFinishedAt(null), FLASH_MS)
    return () => window.clearTimeout(id)
  }, [finishedAt])

  function onStart() {
    unlockAudio()
    setFinishedAt(null)
    timer.start(restSeconds)
  }

  if (finishedAt !== null) {
    return (
      <div className="rest-timer done" role="alert">
        <button type="button" className="rest-done" onClick={() => setFinishedAt(null)}>
          ¡Descanso terminado! A por la siguiente serie
        </button>
      </div>
    )
  }

  if (!timer.running) {
    return (
      <div className="rest-timer">
        <button type="button" className="secondary full" onClick={onStart}>
          ⏱ Descanso {formatElapsed(restSeconds * 1000)}
        </button>
      </div>
    )
  }

  return (
    <div className="rest-timer running">
      <span className="rest-progress" style={{ transform: `scaleX(${timer.progress})` }} aria-hidden="true" />
      <button type="button" className="secondary" aria-label="Restar 15 segundos" onClick={() => timer.adjust(-15)}>
        −15
      </button>
      <span className="rest-time" aria-live="off">
        {formatElapsed(Math.ceil(timer.remainingMs / 1000) * 1000)}
      </span>
      <button type="button" className="secondary" aria-label="Sumar 15 segundos" onClick={() => timer.adjust(15)}>
        +15
      </button>
      <button type="button" className="link" onClick={timer.skip}>
        Saltar
      </button>
    </div>
  )
}
