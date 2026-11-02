import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { ExerciseForm } from '../components/ExerciseForm'
import { Sheet } from '../components/Sheet'
import { db, type Exercise } from '../db/db'
import { createExercise, groupByMuscle, listExercises, setExerciseHidden, updateExercise } from '../db/exercises'

export function ExercisesScreen() {
  const [showHidden, setShowHidden] = useState(false)
  const exercises = useLiveQuery(() => listExercises(db, { includeHidden: showHidden }), [showHidden])
  const [editing, setEditing] = useState<Exercise | 'new' | null>(null)

  return (
    <>
      <header className="screen-header">
        <h1>Ejercicios</h1>
        <button type="button" onClick={() => setEditing('new')}>
          + Nuevo
        </button>
      </header>
      <label className="toggle">
        <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />
        Mostrar ocultos
      </label>

      {groupByMuscle(exercises ?? []).map(([group, list]) => (
        <div key={group} className="group">
          <h3>{group}</h3>
          <ul className="list">
            {list.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  className={`list-item ${e.hidden ? 'muted' : ''}`}
                  onClick={() => setEditing(e)}
                >
                  <span>{e.name}</span>
                  <small>{e.hidden ? 'Oculto' : e.equipment}</small>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {editing === 'new' && (
        <Sheet title="Nuevo ejercicio" onClose={() => setEditing(null)}>
          <ExerciseForm
            submitLabel="Crear"
            onSubmit={async (input) => {
              await createExercise(db, input)
              setEditing(null)
            }}
          />
        </Sheet>
      )}
      {editing && editing !== 'new' && (
        <Sheet title="Editar ejercicio" onClose={() => setEditing(null)}>
          <ExerciseForm
            initial={editing}
            submitLabel="Guardar"
            onSubmit={async (input) => {
              await updateExercise(db, editing.id, input)
              setEditing(null)
            }}
          />
          <button
            type="button"
            className="secondary full"
            onClick={async () => {
              await setExerciseHidden(db, editing.id, !editing.hidden)
              setEditing(null)
            }}
          >
            {editing.hidden ? 'Mostrar en la lista' : 'Ocultar de la lista'}
          </button>
          <p className="hint">Ocultar no borra el historial: el ejercicio deja de aparecer al añadir ejercicios.</p>
        </Sheet>
      )}
    </>
  )
}
