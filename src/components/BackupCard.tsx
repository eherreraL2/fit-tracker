import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState, type ChangeEvent } from 'react'
import { db } from '../db/db'
import { backupFileName, buildBackup, getLastBackupAt, markBackupDone, parseBackup, restoreBackup } from '../db/backup'
import { formatDate, formatTime } from '../lib/format'
import { saveFile } from '../lib/share'

type Status = { kind: 'ok' | 'error'; text: string } | null

export function BackupCard() {
  // Built ahead of the tap so the share sheet opens within iOS's user-gesture window.
  const backup = useLiveQuery(() => buildBackup(db), [])
  const lastBackupAt = useLiveQuery(() => getLastBackupAt(db), [])
  const fileInput = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<Status>(null)

  async function onExport() {
    if (!backup) return
    const now = Date.now()
    const payload = { ...backup, exportedAt: now }
    const file = new File([JSON.stringify(payload)], backupFileName(now), { type: 'application/json' })
    try {
      const result = await saveFile(file)
      if (result === 'cancelled') return
      await markBackupDone(db, now)
      setStatus({ kind: 'ok', text: `Copia creada: ${file.name}` })
    } catch (err) {
      setStatus({ kind: 'error', text: `No se pudo guardar la copia: ${err instanceof Error ? err.message : String(err)}` })
    }
  }

  async function onImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const parsed = parseBackup(JSON.parse(await file.text()))
      const finished = parsed.sessions.filter((s) => s.endedAt !== null).length
      const ok = window.confirm(
        `Restaurar la copia del ${formatDate(parsed.exportedAt)} (${finished} entrenamientos, ${parsed.sets.length} series)?\n\n` +
          'Esto REEMPLAZA todos los datos actuales de la app.',
      )
      if (!ok) return
      await restoreBackup(db, parsed)
      setStatus({ kind: 'ok', text: 'Copia restaurada.' })
    } catch (err) {
      const message = err instanceof SyntaxError ? 'el archivo no es JSON válido' : err instanceof Error ? err.message : String(err)
      setStatus({ kind: 'error', text: message })
    }
  }

  const finishedCount = backup?.sessions.filter((s) => s.endedAt !== null).length ?? 0

  return (
    <section className="card">
      <h2>Copia de seguridad</h2>
      <p className="hint">
        Tus datos solo existen en este iPhone. Guarda una copia en Archivos o iCloud Drive con regularidad.
      </p>
      <p className="hint">
        Última copia:{' '}
        {lastBackupAt ? `${formatDate(lastBackupAt)}, ${formatTime(lastBackupAt)}` : 'nunca'} · {finishedCount} entrenamientos
        guardados
      </p>
      <button type="button" className="full" onClick={onExport} disabled={!backup}>
        Exportar copia
      </button>
      <button type="button" className="secondary full" onClick={() => fileInput.current?.click()}>
        Restaurar desde archivo
      </button>
      <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={onImport} />
      {status && <p className={status.kind === 'error' ? 'error' : 'hint'}>{status.text}</p>}
    </section>
  )
}
