import { useEffect, type ReactNode } from 'react'
import { IconClose } from './Icons'

export default function Sheet({
  title,
  onClose,
  children,
  right,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  right?: ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="sheet-mask" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <div className="sheet-title">
          <span>{title}</span>
          <div className="row" style={{ gap: 6 }}>
            {right}
            <button className="icon-btn" onClick={onClose} aria-label="关闭">
              <IconClose size={17} />
            </button>
          </div>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  )
}
