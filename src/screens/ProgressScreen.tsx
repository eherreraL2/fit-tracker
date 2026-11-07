import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { ExerciseProgress } from '../components/ExerciseProgress'
import { WeeklyVolume } from '../components/WeeklyVolume'
import { db } from '../db/db'
import { listTrainedExercises } from '../db/progress'
import { formatDate } from '../lib/format'

type View = 'exercises' | 'week'

export function ProgressScreen() {
  const [view, setView] = useState<View>('exercises')
  const [exerciseId, setExerciseId] = useState<number | null>(null)
  const trained = useLiveQuery(() => listTrainedExercises(db), [])

  const selected = trained?.find((t) => t.exercise.id === exerciseId)
  if (selected) return <ExerciseProgress exercise={selected.exercise} onBack={() => setExerciseId(null)} />

  return (
    <>
      <header className="screen-header">
        <h1>Progreso</h1>
      </header>
      <div className="segmented" role="tablist">
        <button type="button" role="tab" aria-selected={view === 'exercises'} onClick={() => setView('exercises')}>
          Por ejercicio
        </button>
        <button type="button" role="tab" aria-selected={view === 'week'} onClick={() => setView('week')}>
          Volumen semanal
        </button>
      </div>

      {view === 'week' && <WeeklyVolume />}

      {view === 'exercises' && (
        <>
          {trained?.length === 0 && <p className="hint">Termina tu primer entrenamiento para ver tu progreso.</p>}
          <ul className="list">
            {trained?.map(({ exercise, sessionCount, lastDate }) => (
              <li key={exercise.id}>
                <button type="button" className="list-item" onClick={() => setExerciseId(exercise.id)}>
                  <span>
                    {exercise.name}
                    <small>
                      {sessionCount} {sessionCount === 1 ? 'sesión' : 'sesiones'} · última {formatDate(lastDate)}
                    </small>
                  </span>
                  <small aria-hidden="true">›</small>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}
