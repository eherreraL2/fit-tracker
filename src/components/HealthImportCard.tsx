import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db } from '../db/db'
import { getLastHealthImportAt, importHealthSamples } from '../db/health'
import { formatDate, formatTime } from '../lib/format'
import { parseHealthText } from '../lib/healthText'

type Status = { kind: 'ok' | 'error'; text: string } | null

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

export function HealthImportCard() {
  const lastImportAt = useLiveQuery(() => getLastHealthImportAt(db), [])
  const [status, setStatus] = useState<Status>(null)
  const [manual, setManual] = useState(false)
  const [pasted, setPasted] = useState('')

  async function importText(text: string) {
    const { samples, invalidLines } = parseHealthText(text)
    if (samples.length === 0) {
      setStatus({
        kind: 'error',
        text: 'No encontré datos de pulso ni calorías. ¿Ejecutaste el atajo justo antes? Revisa que copie líneas que empiecen por "hr;" o "kcal;".',
      })
      return
    }
    const result = await importHealthSamples(db, samples)
    const parts = [
      `${plural(result.added, 'lectura nueva', 'lecturas nuevas')} en ${plural(result.sessionIds.length, 'sesión', 'sesiones')}`,
    ]
    if (result.duplicates > 0) parts.push(`${result.duplicates} ya importadas`)
    if (result.outsideSessions > 0) parts.push(`${result.outsideSessions} fuera de entrenamientos (descartadas)`)
    if (invalidLines > 0) parts.push(`${plural(invalidLines, 'línea ilegible', 'líneas ilegibles')}`)
    setStatus({ kind: 'ok', text: `${parts.join(' · ')}.` })
    setPasted('')
    setManual(false)
  }

  async function onImportClipboard() {
    try {
      await importText(await navigator.clipboard.readText())
    } catch {
      setManual(true)
      setStatus({ kind: 'error', text: 'No se pudo leer el portapapeles. Pega el texto abajo.' })
    }
  }

  return (
    <section className="card">
      <h2>Amazfit / Salud</h2>
      <p className="hint">
        Trae el pulso y las calorías que Zepp guarda en Apple Salud, y los asocia a tus entrenamientos por la hora.
      </p>
      <p className="hint">
        Última importación: {lastImportAt ? `${formatDate(lastImportAt)}, ${formatTime(lastImportAt)}` : 'nunca'}
      </p>
      <button type="button" className="full" onClick={onImportClipboard}>
        Importar desde el portapapeles
      </button>
      {manual && (
        <div className="stack">
          <textarea
            className="paste-area"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder="Mantén pulsado y elige Pegar"
            rows={4}
          />
          <button type="button" className="secondary full" disabled={!pasted.trim()} onClick={() => void importText(pasted)}>
            Importar texto pegado
          </button>
        </div>
      )}
      {status && <p className={status.kind === 'error' ? 'error' : 'hint'}>{status.text}</p>}

      <details className="howto">
        <summary>Cómo crear el atajo (una sola vez)</summary>
        <ol>
          <li>
            Abre la app <strong>Atajos</strong> → <strong>+</strong> y llámalo <em>Fit Tracker Salud</em>.
          </li>
          <li>
            Añade <strong>Buscar muestras de salud</strong>: tipo <em>Frecuencia cardíaca</em>, filtro{' '}
            <em>Fecha de inicio está en los últimos 2 días</em>, ordenar por <em>Fecha de inicio</em>, sin límite.
          </li>
          <li>
            Añade <strong>Repetir con cada</strong> sobre esas muestras y dentro una acción <strong>Texto</strong> con:
            <code>hr;[Fecha de inicio];[Valor]</code>
            Inserta las variables desde <em>Elemento de repetición</em>. En <em>Fecha de inicio</em> toca la variable y
            elige formato <em>ISO 8601</em> con <em>Incluir hora</em> activado.
          </li>
          <li>
            Repite los pasos 2 y 3 con el tipo <em>Energía activa</em> y este texto:
            <code>kcal;[Fecha de inicio];[Fecha de finalización];[Valor];[Unidad]</code>
            (ambas fechas en ISO 8601 con hora).
          </li>
          <li>
            Añade <strong>Texto</strong> con las dos variables <em>Resultados de repetición</em>, una por línea, y
            después <strong>Copiar al portapapeles</strong>.
          </li>
        </ol>
        <p className="hint">
          Después de entrenar: abre <strong>Zepp</strong> para que sincronice con Salud → ejecuta el atajo → vuelve aquí y
          pulsa <em>Importar</em>. Puedes repetirlo sin miedo: los datos ya importados no se duplican.
        </p>
      </details>
    </section>
  )
}
