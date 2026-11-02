import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db } from '../db/db'
import { deleteSession, getSessionDetail, listFinishedSessions, setVolume, type SessionSummary } from '../db/sessions'
import { formatDate, formatDuration, formatKg, formatTime } from '../lib/format'

function SessionDetailView({ summary, onBack }: { summary: SessionSummary; onBack: () => void }) {
  const { session } = summary
  const detail = useLiveQuery(() => getSessionDetail(db, session.id), [session.id])

  async function onDelete() {
    if (!window.confirm('¿Borrar este entrenamiento del historial? No se puede deshacer.')) return
    await deleteSession(db, session.id)
    onBack()
  }

  return (
    <>
      <header className="screen-header">
        <div>
          <button type="button" className="link back" onClick={onBack}>
            ‹ Historial
          </button>
          <h1>{formatDate(session.startedAt)}</h1>
          <p className="subtitle">
            {formatTime(session.startedAt)} · {formatDuration((session.endedAt ?? session.startedAt) - session.startedAt)} ·{' '}
            {summary.setCount} series · {formatKg(summary.volumeKg)} kg
          </p>
        </div>
      </header>

      {detail?.map(({ sessionExercise, exercise, sets }) => (
        <section key={sessionExercise.id} className="card">
          <h2>{exercise.name}</h2>
          <ol className="sets">
            {sets.map((s, i) => (
              <li key={s.id}>
                <span className="set-number">{i + 1}</span>
                <span className="set-value">
                  {formatKg(s.weightKg)} kg × {s.reps}
                </span>
              </li>
            ))}
          </ol>
          <p className="hint">Volumen: {formatKg(setVolume(sets))} kg</p>
        </section>
      ))}

      <button type="button" className="link danger centered" onClick={onDelete}>
        Borrar entrenamiento
      </button>
    </>
  )
}

export function HistoryScreen() {
  const sessions = useLiveQuery(() => listFinishedSessions(db), [])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const selected = sessions?.find((s) => s.session.id === selectedId)

  if (selected) return <SessionDetailView summary={selected} onBack={() => setSelectedId(null)} />

  return (
    <>
      <header className="screen-header">
        <h1>Historial</h1>
      </header>
      {sessions?.length === 0 && <p className="hint">Aún no has terminado ningún entrenamiento.</p>}
      <ul className="list cards">
        {sessions?.map((s) => (
          <li key={s.session.id}>
            <button type="button" className="card list-item" onClick={() => setSelectedId(s.session.id)}>
              <span>
                <strong>{formatDate(s.session.startedAt)}</strong>
                <small>{s.exerciseNames.join(', ')}</small>
              </span>
              <small>
                {s.setCount} series
                <br />
                {formatKg(s.volumeKg)} kg
              </small>
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}
