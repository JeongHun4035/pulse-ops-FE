import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { IoMdCloseCircle } from 'react-icons/io'

import Button from '@/components/common/Button/Button'

import type { ConfirmProps } from '@/types/interfaces/components'
import './Confirm.css'

const Confirm = ({
  isOpen,
  onClose,
  onConfirm,
  pending = false,
  title,
  contents,
  footer,
  className = '',
  contentClassName = '',
  style,
  contentStyle,
}: ConfirmProps) => {
  const titleId = useId()
  const contentId = useId()
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const cancel = container.current?.querySelector<HTMLButtonElement>('[data-confirm-cancel]') ?? container.current?.querySelector<HTMLButtonElement>('.confirm-close')
    cancel?.focus()
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
      className="confirm-overlay"
      onClick={close}
    >
      <div
        ref={container}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={contentId}
        aria-busy={pending}
        tabIndex={-1}
        className={`confirm-container ${className}`}
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
        <div className="confirm-header">
          <div className="confirm-title" id={titleId}>
            {title ?? '확인'}
          </div>

          <button
            type="button"
            className="confirm-close"
            onClick={close}
            disabled={pending}
            aria-label="확인 팝업 닫기"
          >
            <IoMdCloseCircle />
          </button>
        </div>

        <div
          id={contentId}
          className={`confirm-content ${contentClassName}`}
          style={contentStyle}
        >
          {contents}
        </div>

        <div className="confirm-footer">
          {footer ? (
            footer
          ) : (
            <div className="confirm-footer-actions">
              <Button
                size="sm"
                onClick={onConfirm}
                disabled={pending}
              >
                {pending ? '처리 중…' : '확인'}
              </Button>

              <Button
                size="sm"
                onClick={close}
                disabled={pending}
                data-confirm-cancel
              >
                취소
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default Confirm
