import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { ExerciseProgress } from '../components/ExerciseProgress'
import { WeeklyVolume } from '../components/WeeklyVolume'
import { db, MUSCLE_GROUPS, type MuscleGroup } from '../db/db'
import { listTrainedExercises, type TrainedExercise } from '../db/progress'
import { formatDate } from '../lib/format'

type View = 'exercises' | 'week'

function plural(n: number, singular: string, pluralForm: string): string {
  return `${n} ${n === 1 ? singular : pluralForm}`
}

/** Muscle groups with trained exercises, in catalog order, each with its exercises (most recent first). */
function groupTrained(trained: TrainedExercise[]): { muscle: MuscleGroup; items: TrainedExercise[]; lastDate: number }[] {
  return MUSCLE_GROUPS.flatMap((muscle) => {
    const items = trained.filter((t) => t.exercise.muscleGroup === muscle)
    return items.length > 0 ? [{ muscle, items, lastDate: Math.max(...items.map((t) => t.lastDate)) }] : []
  })
}

export function ProgressScreen() {
  const [view, setView] = useState<View>('exercises')
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null)
  const [exerciseId, setExerciseId] = useState<number | null>(null)
  const trained = useLiveQuery(() => listTrainedExercises(db), [])

  const selected = trained?.find((t) => t.exercise.id === exerciseId)
  if (selected) {
    return (
      <ExerciseProgress
        exercise={selected.exercise}
        backLabel={muscle ?? 'Progreso'}
        onBack={() => setExerciseId(null)}
      />
    )
  }

  const groups = groupTrained(trained ?? [])
  const group = groups.find((g) => g.muscle === muscle)
  if (group) {
    return (
      <>
        <header className="screen-header">
          <div>
            <button type="button" className="link back" onClick={() => setMuscle(null)}>
              ‹ Progreso
            </button>
            <h1>{group.muscle}</h1>
          </div>
        </header>
        <ul className="list">
          {group.items.map(({ exercise, sessionCount, lastDate }) => (
            <li key={exercise.id}>
              <button type="button" className="list-item" onClick={() => setExerciseId(exercise.id)}>
                <span>
                  {exercise.name}
                  <small>
                    {plural(sessionCount, 'sesión', 'sesiones')} · última {formatDate(lastDate)}
                  </small>
                </span>
                <small aria-hidden="true">›</small>
              </button>
            </li>
          ))}
        </ul>
      </>
    )
  }

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
            {groups.map((g) => (
              <li key={g.muscle}>
                <button type="button" className="list-item" onClick={() => setMuscle(g.muscle)}>
                  <span>
                    {g.muscle}
                    <small>
                      {plural(g.items.length, 'ejercicio', 'ejercicios')} · último {formatDate(g.lastDate)}
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
