import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, type Exercise } from '../db/db'
import { getExerciseHistory, getRecords, isBodyweightOnly, type SessionPoint } from '../db/progress'
import { formatDate, formatKg, formatSet } from '../lib/format'
import { LineChart } from './LineChart'

interface Metric {
  id: string
  label: string
  description: string
  value: (p: SessionPoint) => number | null
  unit: string
}

const LOADED_METRICS: Metric[] = [
  {
    id: 'e1rm',
    label: '1RM est.',
    description: 'Mejor 1RM estimado de cada sesión (fórmula de Epley, series de hasta 12 reps).',
    value: (p) => p.bestE1rm,
    unit: 'kg',
  },
  { id: 'top', label: 'Peso máx.', description: 'Serie más pesada de cada sesión.', value: (p) => p.topWeightKg, unit: 'kg' },
  { id: 'volume', label: 'Volumen', description: 'Suma de peso × reps de cada sesión.', value: (p) => p.volumeKg, unit: 'kg' },
]

const BODYWEIGHT_METRICS: Metric[] = [
  { id: 'reps', label: 'Reps máx.', description: 'Mejor serie de cada sesión.', value: (p) => p.maxReps, unit: 'reps' },
  { id: 'total', label: 'Reps totales', description: 'Suma de reps de cada sesión.', value: (p) => p.totalReps, unit: 'reps' },
]

const shortDate = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' })

export function ExerciseProgress({ exercise, onBack }: { exercise: Exercise; onBack: () => void }) {
  const history = useLiveQuery(() => getExerciseHistory(db, exercise.id), [exercise.id])
  const [metricId, setMetricId] = useState<string | null>(null)

  if (!history) return null
  const bodyweight = isBodyweightOnly(history.flatMap((p) => p.sets))
  const metrics = bodyweight ? BODYWEIGHT_METRICS : LOADED_METRICS
  const metric = metrics.find((m) => m.id === metricId) ?? metrics[0]
  const points = history.flatMap((p) => {
    const y = metric.value(p)
    return y === null ? [] : [{ x: p.date, y }]
  })
  const records = getRecords(history)
  const formatValue = (v: number) => formatKg(Math.round(v * 10) / 10)

  return (
    <>
      <header className="screen-header">
        <div>
          <button type="button" className="link back" onClick={onBack}>
            ‹ Progreso
          </button>
          <h1>{exercise.name}</h1>
          <p className="subtitle">
            {exercise.muscleGroup} · {exercise.equipment}
          </p>
        </div>
      </header>

      <section className="card">
        <div className="segmented small" role="tablist">
          {metrics.map((m) => (
            <button key={m.id} type="button" role="tab" aria-selected={m.id === metric.id} onClick={() => setMetricId(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
        <p className="hint">
          {metric.description} ({metric.unit})
        </p>
        {points.length > 0 ? (
          <LineChart
            points={points}
            label={`${metric.label} de ${exercise.name} por sesión`}
            formatY={formatValue}
            formatX={(x) => shortDate.format(x)}
          />
        ) : (
          <p className="hint">Sin datos para esta métrica todavía.</p>
        )}
      </section>

      <section className="card">
        <h2>Récords personales</h2>
        <dl className="checks">
          {bodyweight ? (
            records.mostReps && (
              <div>
                <dt>Más reps en una serie</dt>
                <dd>
                  {records.mostReps.set.reps} reps · {formatDate(records.mostReps.date)}
                </dd>
              </div>
            )
          ) : (
            <>
              {records.heaviest && (
                <div>
                  <dt>Más peso</dt>
                  <dd>
                    {formatSet(records.heaviest.set)} · {formatDate(records.heaviest.date)}
                  </dd>
                </div>
              )}
              {records.bestE1rm && (
                <div>
                  <dt>Mejor 1RM est.</dt>
                  <dd>
                    {formatKg(Math.round(records.bestE1rm.value * 10) / 10)} kg ({formatSet(records.bestE1rm.set)})
                  </dd>
                </div>
              )}
              {records.mostVolume && (
                <div>
                  <dt>Más volumen</dt>
                  <dd>
                    {formatKg(records.mostVolume.volumeKg)} kg · {formatDate(records.mostVolume.date)}
                  </dd>
                </div>
              )}
            </>
          )}
        </dl>
      </section>

      <section className="card">
        <h2>Sesiones</h2>
        <ul className="session-table">
          {[...history].reverse().map((p) => (
            <li key={p.sessionId}>
              <span className="hint">{formatDate(p.date)}</span>
              <span>{p.sets.map(formatSet).join(' · ')}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
