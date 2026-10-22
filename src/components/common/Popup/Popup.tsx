import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { IoMdCloseCircle } from 'react-icons/io'

import type { PopupProps } from '@/types/interfaces/components'

import './Popup.css'

const Popup = ({
  isOpen,
  onClose,
  pending = false,
  title,
  children,
  footer,
  size = 'md',
  className = '',
  contentClassName = '',
  style,
  contentStyle,
}: PopupProps) => {
  const titleId = useId()
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const initialFocus = container.current?.querySelector<HTMLElement>('[data-popup-autofocus]') ?? container.current?.querySelector<HTMLButtonElement>('.popup-close')
    initialFocus?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen && pending) container.current?.focus()
  }, [isOpen, pending])

  const close = () => {
    if (!pending) onClose()
  }

  if (!isOpen) {
    return null
  }

  return createPortal(
    <div
      className="popup-overlay"
      onClick={close}
    >
      <div
        ref={container}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={pending}
        tabIndex={-1}
        className={`popup-container popup-${size} ${className}`}
        style={style}
        onClick={event => event.stopPropagation()}
        onKeyDown={event => {
          if (event.key === 'Escape') {
            event.preventDefault()
            close()
          }
          if (event.key !== 'Tab') return
          const focusable = container.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')
          const first = focusable?.[0]
          const last = focusable?.[focusable.length - 1]
          if (!first || !last) {
            event.preventDefault()
            container.current?.focus()
          } else if (event.shiftKey && (document.activeElement === first || document.activeElement === container.current)) {
            event.preventDefault()
            last.focus()
          } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === container.current)) {
            event.preventDefault()
            first.focus()
          }
        }}
      >
        <div className="popup-header">
          <div className="popup-title" id={titleId}>
            {title ?? '팝업'}
          </div>

          <button
            type="button"
            className="popup-close"
            onClick={close}
            disabled={pending}
            aria-label="팝업 닫기"
          >
            <IoMdCloseCircle />
          </button>
        </div>

        <div
          className={`popup-content ${contentClassName}`}
          style={contentStyle}
        >
          {children}
        </div>

        {footer && (
          <div className="popup-footer">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

export default Popup
