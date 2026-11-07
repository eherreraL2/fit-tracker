import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { ExerciseLogger } from '../components/ExerciseLogger'
import { ExercisePicker } from '../components/ExercisePicker'
import { RestTimer } from '../components/RestTimer'
import { TemplateEditor } from '../components/TemplateEditor'
import { isBackupDue } from '../db/backup'
import { db, type Session, type Template } from '../db/db'
import { listTemplates, startSessionFromTemplate } from '../db/templates'
import {
  addExerciseToSession,
  deleteSession,
  finishSession,
  getActiveSession,
  getSessionDetail,
  listFinishedSessions,
  startSession,
  type SessionExerciseDetail,
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

function defaultOpenId(detail: SessionExerciseDetail[]): number | undefined {
  let latest: { id: number; at: number } | null = null
  for (const d of detail) {
    const at = d.sets.at(-1)?.createdAt
    if (at !== undefined && (!latest || at > latest.at)) latest = { id: d.sessionExercise.id, at }
  }
  return latest?.id ?? detail[0]?.sessionExercise.id
}

function ActiveSession({ session }: { session: Session }) {
  const now = useNow(1000)
  const detail = useLiveQuery(() => getSessionDetail(db, session.id), [session.id])
  const [picking, setPicking] = useState(false)
  // Only one exercise is open at a time; by default the most recently added one.
  // Until the user picks one (or after a reload): the exercise of the latest set, else the first one (template order).
  const [openId, setOpenId] = useState<number | 'none' | null>(null)
  const expandedId = openId ?? defaultOpenId(detail ?? [])

  async function onPick(exerciseId: number) {
    setPicking(false)
    setOpenId(await addExerciseToSession(db, session.id, exerciseId))
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

      {detail?.map((d) => {
        const id = d.sessionExercise.id
        const expanded = id === expandedId
        return (
          <ExerciseLogger
            key={id}
            detail={d}
            expanded={expanded}
            onToggle={() => setOpenId(expanded ? 'none' : id)}
            onSetAdded={() => setOpenId(id)}
          />
        )
      })}

      <button type="button" className="secondary full big" onClick={() => setPicking(true)}>
        + Añadir ejercicio
      </button>
      <button type="button" className="link danger centered" onClick={onDiscard}>
        Descartar entrenamiento
      </button>

      <RestTimer />

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

function Templates() {
  const templates = useLiveQuery(() => listTemplates(db), [])
  const names = useLiveQuery(async () => new Map((await db.exercises.toArray()).map((e) => [e.id, e.name])), [])
  const [editing, setEditing] = useState<Template | 'new' | null>(null)

  return (
    <section className="card">
      <div className="logger-header">
        <h2>Plantillas</h2>
        <button type="button" className="link" onClick={() => setEditing('new')}>
          + Nueva
        </button>
      </div>
      {templates?.length === 0 && (
        <p className="hint">Guarda una lista de ejercicios para empezar con ella. También desde una sesión del Historial.</p>
      )}
      <ul className="template-cards">
        {templates?.map((t) => (
          <li key={t.id}>
            <button type="button" className="template-start" onClick={() => void startSessionFromTemplate(db, t.id)}>
              <strong>{t.name}</strong>
              <small>{t.exerciseIds.map((id) => names?.get(id) ?? '…').join(' · ')}</small>
            </button>
            <button type="button" className="link" onClick={() => setEditing(t)}>
              Editar
            </button>
          </li>
        ))}
      </ul>
      {editing && (
        <TemplateEditor
          template={editing === 'new' ? { name: '', exerciseIds: [] } : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
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
        Empezar entrenamiento libre
      </button>
      <Templates />
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
