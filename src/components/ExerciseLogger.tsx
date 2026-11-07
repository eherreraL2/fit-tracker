import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type FormEvent } from 'react'
import { db } from '../db/db'
import { getPriorBests, markRecordSets } from '../db/progress'
import type { SessionExerciseDetail } from '../db/sessions'
import { addSet, deleteSet, getLastPerformance, removeSessionExercise } from '../db/sessions'
import { formatDate, formatKg, formatSet, parseNumber } from '../lib/format'
import { suggestNextSet } from '../lib/suggest'

interface ExerciseLoggerProps {
  detail: SessionExerciseDetail
  expanded: boolean
  onToggle: () => void
  onSetAdded: () => void
}

const WEIGHT_STEP = 2.5
/** Reps in reserve; the last choice means "that many or more". */
const RIR_CHOICES = [0, 1, 2, 3, 4] as const

export function ExerciseLogger({ detail, expanded, onToggle, onSetAdded }: ExerciseLoggerProps) {
  const { sessionExercise, exercise, sets } = detail
  const last = useLiveQuery(
    () => getLastPerformance(db, exercise.id, sessionExercise.sessionId),
    [exercise.id, sessionExercise.sessionId],
  )
  const priorBests = useLiveQuery(
    () => getPriorBests(db, exercise.id, sessionExercise.sessionId),
    [exercise.id, sessionExercise.sessionId],
  )
  const recordFlags = markRecordSets(sets, priorBests ?? null)
  const recordCount = recordFlags.filter(Boolean).length
  const suggestion = suggestNextSet(sets, last?.sets)
  // Inputs stay empty until edited; the placeholder shows the suggestion and is used if left blank.
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')
  const [rir, setRir] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const effectiveWeight = weight === '' ? (suggestion?.weightKg ?? Number.NaN) : parseNumber(weight)
  const effectiveReps = reps === '' ? (suggestion?.reps ?? Number.NaN) : parseNumber(reps)

  function bumpWeight(delta: number) {
    const base = Number.isFinite(effectiveWeight) ? effectiveWeight : 0
    setWeight(formatKg(Math.max(0, base + delta)))
  }

  function bumpReps(delta: number) {
    const base = Number.isFinite(effectiveReps) ? effectiveReps : 0
    setReps(String(Math.max(1, base + delta)))
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    try {
      await addSet(db, sessionExercise.id, { weightKg: effectiveWeight, reps: effectiveReps, rir })
      setWeight('')
      setReps('')
      setRir(null)
      setError(null)
      onSetAdded()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function onRemove() {
    if (sets.length > 0 && !window.confirm(`¿Quitar ${exercise.name} y sus ${sets.length} series?`)) return
    await removeSessionExercise(db, sessionExercise.id)
  }

  if (!expanded) {
    return (
      <section className="card logger collapsed">
        <button type="button" className="logger-summary" onClick={onToggle} aria-expanded="false">
          <span>
            <strong>{exercise.name}</strong>
            <small>
              {sets.length === 0 ? 'Sin series' : `${sets.length} series · ${sets.map(formatSet).join(' · ')}`}
            </small>
          </span>
          {recordCount > 0 && (
            <span className="pr-badge" aria-label={`${recordCount} récords`}>
              🏆 {recordCount}
            </span>
          )}
          <span className="chevron" aria-hidden="true">
            ›
          </span>
        </button>
      </section>
    )
  }

  return (
    <section className="card logger">
      <div className="logger-header">
        <button type="button" className="logger-title" onClick={onToggle} aria-expanded="true">
          <h2>{exercise.name}</h2>
        </button>
        <button type="button" className="link danger" onClick={onRemove}>
          Quitar
        </button>
      </div>
      <p className="hint">
        {last
          ? `Última vez (${formatDate(last.date)}): ${last.sets.map(formatSet).join(' · ')}`
          : 'Primera vez con este ejercicio'}
      </p>

      {sets.length > 0 && (
        <ol className="sets">
          {sets.map((s, i) => (
            <li key={s.id}>
              <span className="set-number">{i + 1}</span>
              <span className="set-value">
                {formatKg(s.weightKg)} kg × {s.reps}
                {s.rir != null && <small className="rir"> · RIR {s.rir}</small>}
              </span>
              {recordFlags[i] && <span className="pr-badge">🏆 Récord</span>}
              <button
                type="button"
                className="icon-button"
                aria-label={`Borrar serie ${i + 1}`}
                onClick={() => void deleteSet(db, s.id)}
              >
                ✕
              </button>
            </li>
          ))}
        </ol>
      )}

      <form className="set-form" onSubmit={onSubmit}>
        <div className="stepper">
          <button type="button" aria-label="Menos peso" onClick={() => bumpWeight(-WEIGHT_STEP)}>
            −
          </button>
          <label>
            <input
              inputMode="decimal"
              value={weight}
              placeholder={suggestion ? formatKg(suggestion.weightKg) : 'kg'}
              onChange={(e) => setWeight(e.target.value)}
              aria-label="Peso en kg"
            />
            <span>kg</span>
          </label>
          <button type="button" aria-label="Más peso" onClick={() => bumpWeight(WEIGHT_STEP)}>
            +
          </button>
        </div>
        <div className="stepper">
          <button type="button" aria-label="Menos repeticiones" onClick={() => bumpReps(-1)}>
            −
          </button>
          <label>
            <input
              inputMode="numeric"
              value={reps}
              placeholder={suggestion ? String(suggestion.reps) : 'reps'}
              onChange={(e) => setReps(e.target.value)}
              aria-label="Repeticiones"
            />
            <span>reps</span>
          </label>
          <button type="button" aria-label="Más repeticiones" onClick={() => bumpReps(1)}>
            +
          </button>
        </div>
        <div className="rir-picker" role="group" aria-label="Repeticiones en reserva (opcional)">
          <span>RIR</span>
          {RIR_CHOICES.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={rir === value}
              onClick={() => setRir(rir === value ? null : value)}
            >
              {value === RIR_CHOICES.at(-1) ? `${value}+` : value}
            </button>
          ))}
        </div>
        <button type="submit" className="full">
          Añadir serie {sets.length + 1}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </section>
  )
}
