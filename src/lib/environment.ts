export interface StorageStatus {
  persisted: boolean | null
  usageBytes: number | null
  quotaBytes: number | null
}

/** True when launched from the home screen rather than a Safari tab. */
export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches
}

export async function requestPersistentStorage(): Promise<boolean | null> {
  if (!navigator.storage?.persist) return null
  if (await navigator.storage.persisted()) return true
  return navigator.storage.persist()
}

export async function getStorageStatus(): Promise<StorageStatus> {
  const storage = navigator.storage
  if (!storage) return { persisted: null, usageBytes: null, quotaBytes: null }
  const [persisted, estimate] = await Promise.all([
    storage.persisted ? storage.persisted() : Promise.resolve(null),
    storage.estimate ? storage.estimate() : Promise.resolve(undefined),
  ])
  return {
    persisted,
    usageBytes: estimate?.usage ?? null,
    quotaBytes: estimate?.quota ?? null,
  }
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}
