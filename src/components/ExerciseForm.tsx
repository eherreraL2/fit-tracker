import { useState, type FormEvent } from 'react'
import { EQUIPMENT, MUSCLE_GROUPS, type Equipment, type MuscleGroup } from '../db/db'
import type { ExerciseInput } from '../db/exercises'

interface ExerciseFormProps {
  initial?: Partial<ExerciseInput>
  submitLabel: string
  onSubmit: (input: ExerciseInput) => Promise<void>
}

export function ExerciseForm({ initial, submitLabel, onSubmit }: ExerciseFormProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [muscleGroup, setMuscleGroup] = useState<MuscleGroup>(initial?.muscleGroup ?? 'Pecho')
  const [equipment, setEquipment] = useState<Equipment>(initial?.equipment ?? 'Barra')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    try {
      await onSubmit({ name, muscleGroup, equipment })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <form className="stack" onSubmit={handleSubmit}>
      <label className="field">
        <span>Nombre</span>
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </label>
      <label className="field">
        <span>Grupo muscular</span>
        <select value={muscleGroup} onChange={(e) => setMuscleGroup(e.target.value as MuscleGroup)}>
          {MUSCLE_GROUPS.map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Equipamiento</span>
        <select value={equipment} onChange={(e) => setEquipment(e.target.value as Equipment)}>
          {EQUIPMENT.map((eq) => (
            <option key={eq}>{eq}</option>
          ))}
        </select>
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit">{submitLabel}</button>
    </form>
  )
}
