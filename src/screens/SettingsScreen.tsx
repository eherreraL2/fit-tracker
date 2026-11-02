import { useEffect, useState } from 'react'
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
