import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { ExerciseLogger } from '../components/ExerciseLogger'
import { ExercisePicker } from '../components/ExercisePicker'
import { isBackupDue } from '../db/backup'
import { db, type Session } from '../db/db'
import {
  addExerciseToSession,
  deleteSession,
  finishSession,
  getActiveSession,
  getSessionDetail,
  listFinishedSessions,
  startSession,
} from '../db/sessions'
import { formatDate, formatElapsed } from '../lib/format'

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}

function ActiveSession({ session }: { session: Session }) {
  const now = useNow(1000)
  const detail = useLiveQuery(() => getSessionDetail(db, session.id), [session.id])
  const [picking, setPicking] = useState(false)

  async function onPick(exerciseId: number) {
    setPicking(false)
    await addExerciseToSession(db, session.id, exerciseId)
  }

  async function onFinish() {
    const setCount = detail?.reduce((n, d) => n + d.sets.length, 0) ?? 0
    const message =
      setCount === 0
        ? 'La sesión no tiene series y se descartará. ¿Terminar?'
        : `¿Terminar el entrenamiento? (${setCount} series)`
    if (!window.confirm(message)) return
    await finishSession(db, session.id)
  }

  async function onDiscard() {
    if (!window.confirm('¿Descartar este entrenamiento? Se borrarán todas sus series.')) return
    await deleteSession(db, session.id)
  }

  return (
    <>
      <header className="screen-header">
        <div>
          <h1>Entrenando</h1>
          <p className="subtitle">
            {formatDate(session.startedAt)} · <span className="timer">{formatElapsed(now - session.startedAt)}</span>
          </p>
        </div>
        <button type="button" onClick={onFinish}>
          Terminar
        </button>
      </header>

      {detail?.map((d) => <ExerciseLogger key={d.sessionExercise.id} detail={d} />)}

      <button type="button" className="secondary full big" onClick={() => setPicking(true)}>
        + Añadir ejercicio
      </button>
      <button type="button" className="link danger centered" onClick={onDiscard}>
        Descartar entrenamiento
      </button>

      {picking && (
        <ExercisePicker
          excludeIds={detail?.map((d) => d.exercise.id) ?? []}
          onPick={onPick}
          onClose={() => setPicking(false)}
        />
      )}
    </>
  )
}

function Idle({ onOpenSettings }: { onOpenSettings: () => void }) {
  const last = useLiveQuery(async () => (await listFinishedSessions(db))[0] ?? null, [])
  const backupDue = useLiveQuery(() => isBackupDue(db), [])

  return (
    <>
      <header className="screen-header">
        <h1>Entrenar</h1>
      </header>
      {backupDue && (
        <button type="button" className="banner" onClick={onOpenSettings}>
          <strong>Haz una copia de seguridad</strong>
          <span>Tus entrenamientos solo están en este iPhone. Toca para exportarlos.</span>
        </button>
      )}
      <button type="button" className="full big" onClick={() => void startSession(db)}>
        Empezar entrenamiento
      </button>
      {last && (
        <section className="card">
          <h2>Último entrenamiento</h2>
          <p className="hint">
            {formatDate(last.session.startedAt)} · {last.setCount} series
          </p>
          <p>{last.exerciseNames.join(', ')}</p>
        </section>
      )}
    </>
  )
}

export function TrainScreen({ onOpenSettings }: { onOpenSettings: () => void }) {
  // `null` = loaded and no active session; `undefined` = still loading.
  const active = useLiveQuery(async () => (await getActiveSession(db)) ?? null, [])
  if (active === undefined) return null
  return active ? <ActiveSession session={active} /> : <Idle onOpenSettings={onOpenSettings} />
}
