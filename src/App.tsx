import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { db, type ProbeEntry } from './db/db'
import { addProbe, clearProbes, listProbes } from './db/probes'
import {
  formatBytes,
  getStorageStatus,
  isStandalone,
  requestPersistentStorage,
  type StorageStatus,
} from './lib/environment'

const BUILD_TIME = new Date(__BUILD_TIME__).toLocaleString('es')

function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  return online
}

function yesNo(value: boolean | null): string {
  if (value === null) return 'no soportado'
  return value ? 'sí' : 'no'
}

function App() {
  const online = useOnline()
  const [storage, setStorage] = useState<StorageStatus | null>(null)
  const [swActive, setSwActive] = useState(false)
  const [probes, setProbes] = useState<ProbeEntry[]>([])
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const [status, entries] = await Promise.all([getStorageStatus(), listProbes(db)])
    setStorage(status)
    setProbes(entries)
    setSwActive(Boolean(navigator.serviceWorker?.controller))
  }, [])

  useEffect(() => {
    void refresh()
    navigator.serviceWorker?.addEventListener('controllerchange', refresh)
    return () => navigator.serviceWorker?.removeEventListener('controllerchange', refresh)
  }, [refresh])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    try {
      await addProbe(db, note)
      setNote('')
      setError(null)
      await requestPersistentStorage()
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function onClear() {
    await clearProbes(db)
    await refresh()
  }

  const checks: [string, string][] = [
    ['Abierta desde pantalla de inicio', yesNo(isStandalone())],
    ['Conexión', online ? 'online' : 'offline'],
    ['Service worker activo (offline)', yesNo(swActive)],
    ['Almacenamiento persistente', yesNo(storage?.persisted ?? null)],
    ['Uso / cuota', `${formatBytes(storage?.usageBytes ?? null)} / ${formatBytes(storage?.quotaBytes ?? null)}`],
    ['Versión (build)', BUILD_TIME],
  ]

  return (
    <main className="app">
      <header>
        <h1>Fit Tracker</h1>
        <p className="subtitle">Fase 0 · diagnóstico de plataforma</p>
      </header>

      <section className="card">
        <h2>Estado</h2>
        <dl className="checks">
          {checks.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="card">
        <h2>Prueba de persistencia</h2>
        <p className="hint">
          Guarda una nota, cierra la app por completo y vuelve a abrirla (también en modo avión). La nota debe seguir aquí.
        </p>
        <form onSubmit={onSubmit} className="probe-form">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="p. ej. Press banca 60 kg × 8"
            aria-label="Nota de prueba"
          />
          <button type="submit">Guardar</button>
        </form>
        {error && <p className="error">{error}</p>}
        <ul className="probes">
          {probes.map((p) => (
            <li key={p.id}>
              <span>{p.note}</span>
              <time>{new Date(p.createdAt).toLocaleString('es')}</time>
            </li>
          ))}
        </ul>
        {probes.length > 0 && (
          <button type="button" className="secondary" onClick={onClear}>
            Borrar notas de prueba
          </button>
        )}
      </section>
    </main>
  )
}

export default App
