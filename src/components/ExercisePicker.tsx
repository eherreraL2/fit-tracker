import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { db } from '../db/db'
import { createExercise, groupByMuscle, listExercises, normalizeName } from '../db/exercises'
import { ExerciseForm } from './ExerciseForm'
import { Sheet } from './Sheet'

interface ExercisePickerProps {
  excludeIds: number[]
  onPick: (exerciseId: number) => void
  onClose: () => void
}

export function ExercisePicker({ excludeIds, onPick, onClose }: ExercisePickerProps) {
  const exercises = useLiveQuery(() => listExercises(db), [])
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)

  const groups = useMemo(() => {
    const q = normalizeName(query.trim())
    const visible = (exercises ?? []).filter((e) => !excludeIds.includes(e.id) && normalizeName(e.name).includes(q))
    return groupByMuscle(visible)
  }, [exercises, excludeIds, query])

  if (creating) {
    return (
      <Sheet title="Nuevo ejercicio" onClose={() => setCreating(false)}>
        <ExerciseForm
          initial={{ name: query.trim() }}
          submitLabel="Crear y añadir"
          onSubmit={async (input) => onPick(await createExercise(db, input))}
        />
      </Sheet>
    )
  }

  return (
    <Sheet title="Añadir ejercicio" onClose={onClose}>
      <input
        type="search"
        className="search"
        placeholder="Buscar ejercicio"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <button type="button" className="secondary full" onClick={() => setCreating(true)}>
        + Crear {query.trim() ? `«${query.trim()}»` : 'ejercicio nuevo'}
      </button>
      {groups.map(([group, list]) => (
        <div key={group} className="group">
          <h3>{group}</h3>
          <ul className="list">
            {list.map((e) => (
              <li key={e.id}>
                <button type="button" className="list-item" onClick={() => onPick(e.id)}>
                  <span>{e.name}</span>
                  <small>{e.equipment}</small>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {exercises && groups.length === 0 && <p className="hint">Sin resultados.</p>}
    </Sheet>
  )
}
