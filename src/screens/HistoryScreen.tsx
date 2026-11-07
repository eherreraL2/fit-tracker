import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { HeartRateCard } from '../components/HeartRateCard'
import { TemplateEditor } from '../components/TemplateEditor'
import { db } from '../db/db'
import { getSessionHealth, setPeaks } from '../db/health'
import { deleteSession, getSessionDetail, listFinishedSessions, setVolume, type SessionSummary } from '../db/sessions'
import { formatDate, formatDuration, formatKg, formatTime } from '../lib/format'

function SessionDetailView({ summary, onBack }: { summary: SessionSummary; onBack: () => void }) {
  const { session } = summary
  const detail = useLiveQuery(() => getSessionDetail(db, session.id), [session.id])
  const health = useLiveQuery(() => getSessionHealth(db, session.id), [session.id])
  const [savingTemplate, setSavingTemplate] = useState(false)
  const allSets = detail?.flatMap((d) => d.sets) ?? []
  const peaks = health?.dense ? setPeaks(allSets, health.heartRate) : new Map<number, number>()

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

      {health && <HeartRateCard health={health} setTimes={allSets.map((s) => s.createdAt)} />}

      {detail?.map(({ sessionExercise, exercise, sets }) => (
        <section key={sessionExercise.id} className="card">
          <h2>{exercise.name}</h2>
          <ol className="sets">
            {sets.map((s, i) => (
              <li key={s.id}>
                <span className="set-number">{i + 1}</span>
                <span className="set-value">
                  {formatKg(s.weightKg)} kg × {s.reps}
                  {s.rir != null && <small className="rir"> · RIR {s.rir}</small>}
                </span>
                {peaks.has(s.id) && (
                  <small className="hr-peak" title="Pulso máximo en esa serie">
                    ♥ {peaks.get(s.id)}
                  </small>
                )}
              </li>
            ))}
          </ol>
          <p className="hint">Volumen: {formatKg(setVolume(sets))} kg</p>
        </section>
      ))}

      <button type="button" className="secondary full" onClick={() => setSavingTemplate(true)}>
        Guardar como plantilla
      </button>
      <button type="button" className="link danger centered" onClick={onDelete}>
        Borrar entrenamiento
      </button>
      {savingTemplate && detail && (
        <TemplateEditor
          template={{ name: '', exerciseIds: detail.map((d) => d.exercise.id) }}
          onClose={() => setSavingTemplate(false)}
        />
      )}
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
