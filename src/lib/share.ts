export type SaveResult = 'shared' | 'downloaded' | 'cancelled'

/**
 * Hands a file to the OS: the iOS share sheet ("Guardar en Archivos") when available, else a download.
 * Must be called synchronously from a tap, since iOS requires a fresh user gesture for sharing.
 */
export async function saveFile(file: File): Promise<SaveResult> {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return 'shared'
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled'
      throw err
    }
  }
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'downloaded'
}
