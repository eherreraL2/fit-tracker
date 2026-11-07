import type { FitDb, Template } from './db'
import { normalizeName } from './exercises'
import { getActiveSession } from './sessions'

export interface TemplateInput {
  name: string
  exerciseIds: number[]
}

export async function listTemplates(db: FitDb): Promise<Template[]> {
  const all = await db.templates.toArray()
  return all.sort((a, b) => a.name.localeCompare(b.name, 'es'))
}

async function validate(db: FitDb, input: TemplateInput, ignoreId?: number): Promise<TemplateInput> {
  const name = input.name.trim()
  if (!name) throw new Error('La plantilla necesita un nombre')
  const exerciseIds = [...new Set(input.exerciseIds)]
  if (exerciseIds.length === 0) throw new Error('Añade al menos un ejercicio')
  const found = await db.exercises.bulkGet(exerciseIds)
  if (found.some((e) => !e)) throw new Error('La plantilla contiene ejercicios que ya no existen')
  const clash = await db.templates
    .filter((t) => t.id !== ignoreId && normalizeName(t.name) === normalizeName(name))
    .first()
  if (clash) throw new Error(`Ya existe una plantilla llamada "${clash.name}"`)
  return { name, exerciseIds }
}

export async function createTemplate(db: FitDb, input: TemplateInput, now = Date.now()): Promise<number> {
  const valid = await validate(db, input)
  return db.templates.add({ ...valid, createdAt: now, updatedAt: now })
}

export async function updateTemplate(db: FitDb, id: number, input: TemplateInput, now = Date.now()): Promise<void> {
  const valid = await validate(db, input, id)
  await db.templates.update(id, { ...valid, updatedAt: now })
}

export async function deleteTemplate(db: FitDb, id: number): Promise<void> {
  await db.templates.delete(id)
}

/** Ordered exercise ids of a session, for saving it as a template. */
export async function sessionExerciseIds(db: FitDb, sessionId: number): Promise<number[]> {
  const ses = await db.sessionExercises.where({ sessionId }).sortBy('order')
  return ses.map((se) => se.exerciseId)
}

/** Starts a session pre-filled with the template's exercises. Returns the existing session if one is already running. */
export async function startSessionFromTemplate(db: FitDb, templateId: number, now = Date.now()): Promise<number> {
  return db.transaction('rw', db.sessions, db.sessionExercises, db.templates, db.exercises, async () => {
    const active = await getActiveSession(db)
    if (active) return active.id
    const template = await db.templates.get(templateId)
    if (!template) throw new Error('La plantilla ya no existe')
    const exercises = await db.exercises.bulkGet(template.exerciseIds)
    const sessionId = await db.sessions.add({ startedAt: now, endedAt: null })
    await db.sessionExercises.bulkAdd(
      template.exerciseIds
        .filter((_, i) => exercises[i] !== undefined)
        .map((exerciseId, order) => ({ sessionId, exerciseId, order })),
    )
    return sessionId
  })
}
