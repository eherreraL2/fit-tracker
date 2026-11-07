import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { BackupCard } from '../components/BackupCard'
import { db } from '../db/db'
import { getRestSeconds, REST_OPTIONS, setRestSeconds } from '../db/settings'
import { formatElapsed } from '../lib/format'
import {
  formatBytes,
  getStorageStatus,
  isStandalone,
  requestPersistentStorage,
  type StorageStatus,
} from '../lib/environment'

const BUILD_TIME = new Date(__BUILD_TIME__).toLocaleString('es')

function yesNo(value: boolean | null): string {
  if (value === null) return 'no soportado'
  return value ? 'sí' : 'no'
}

export function SettingsScreen() {
  const [storage, setStorage] = useState<StorageStatus | null>(null)
  const restSeconds = useLiveQuery(() => getRestSeconds(db), [])

  useEffect(() => {
    let cancelled = false
    void requestPersistentStorage()
      .then(getStorageStatus)
      .then((status) => {
        if (!cancelled) setStorage(status)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const checks: [string, string][] = [
    ['Abierta desde pantalla de inicio', yesNo(isStandalone())],
    ['Modo offline (service worker)', yesNo(Boolean(navigator.serviceWorker?.controller))],
    ['Almacenamiento persistente', yesNo(storage?.persisted ?? null)],
    ['Uso / cuota', `${formatBytes(storage?.usageBytes ?? null)} / ${formatBytes(storage?.quotaBytes ?? null)}`],
    ['Versión', BUILD_TIME],
  ]

  return (
    <>
      <header className="screen-header">
        <h1>Ajustes</h1>
      </header>
      <section className="card">
        <h2>Descanso entre series</h2>
        <p className="hint">Duración con la que arranca el temporizador. Puedes ajustarla ±15 s en cada descanso.</p>
        <div className="segmented small" role="radiogroup" aria-label="Duración del descanso">
          {REST_OPTIONS.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={s === restSeconds}
              onClick={() => void setRestSeconds(db, s)}
            >
              {formatElapsed(s * 1000)}
            </button>
          ))}
        </div>
      </section>
      <BackupCard />
      <section className="card">
        <h2>Estado de la app</h2>
        <dl className="checks">
          {checks.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  )
}
