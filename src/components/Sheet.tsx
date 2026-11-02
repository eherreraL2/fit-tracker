import { useEffect, type ReactNode } from 'react'

interface SheetProps {
  title: string
  onClose: () => void
  children: ReactNode
}

/** Full-height bottom sheet used for pickers and forms. */
export function Sheet({ title, onClose, children }: SheetProps) {
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-header">
          <h2>{title}</h2>
          <button type="button" className="link" onClick={onClose}>
            Cerrar
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  )
}
