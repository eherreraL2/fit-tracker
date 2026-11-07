import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type FormEvent } from 'react'
import { db, type Template } from '../db/db'
import { createTemplate, deleteTemplate, updateTemplate } from '../db/templates'
import { ExercisePicker } from './ExercisePicker'
import { Sheet } from './Sheet'

interface TemplateEditorProps {
  /** Existing template to edit, or a draft (e.g. built from a past session) to create. */
  template: Template | { name: string; exerciseIds: number[] }
  onClose: () => void
}

function move<T>(list: T[], from: number, to: number): T[] {
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

export function TemplateEditor({ template, onClose }: TemplateEditorProps) {
  const existingId = 'id' in template ? template.id : null
  const [name, setName] = useState(template.name)
  const [exerciseIds, setExerciseIds] = useState(template.exerciseIds)
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const exercises = useLiveQuery(async () => {
    const found = await db.exercises.bulkGet(exerciseIds)
    return new Map(found.flatMap((e) => (e ? [[e.id, e] as const] : [])))
  }, [exerciseIds])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    try {
      const input = { name, exerciseIds }
      if (existingId === null) await createTemplate(db, input)
      else await updateTemplate(db, existingId, input)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function onDelete() {
    if (existingId === null || !window.confirm(`¿Borrar la plantilla "${template.name}"?`)) return
    await deleteTemplate(db, existingId)
    onClose()
  }

  return (
    <>
      <Sheet title={existingId === null ? 'Nueva plantilla' : 'Editar plantilla'} onClose={onClose}>
        <form className="stack" onSubmit={onSubmit}>
          <label className="field">
            <span>Nombre</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="p. ej. Torso A" />
          </label>

          <div className="field">
            <span>Ejercicios ({exerciseIds.length})</span>
            <ol className="list template-list">
              {exerciseIds.map((id, i) => (
                <li key={id}>
                  <span className="template-name">{exercises?.get(id)?.name ?? '…'}</span>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Subir"
                    disabled={i === 0}
                    onClick={() => setExerciseIds(move(exerciseIds, i, i - 1))}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Bajar"
                    disabled={i === exerciseIds.length - 1}
                    onClick={() => setExerciseIds(move(exerciseIds, i, i + 1))}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Quitar"
                    onClick={() => setExerciseIds(exerciseIds.filter((x) => x !== id))}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ol>
            <button type="button" className="secondary full" onClick={() => setPicking(true)}>
              + Añadir ejercicio
            </button>
          </div>

          {error && <p className="error">{error}</p>}
          <button type="submit" className="full">
            Guardar plantilla
          </button>
          {existingId !== null && (
            <button type="button" className="link danger centered" onClick={onDelete}>
              Borrar plantilla
            </button>
          )}
        </form>
      </Sheet>
      {picking && (
        <ExercisePicker
          excludeIds={exerciseIds}
          onPick={(id) => {
            setExerciseIds([...exerciseIds, id])
            setPicking(false)
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </>
  )
}
