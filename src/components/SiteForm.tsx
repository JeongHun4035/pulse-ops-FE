import { Plus, LoaderCircle } from 'lucide-react'
import { useId, useRef, useState } from 'react'

import Popup from '@/components/common/Popup/Popup'
import { INTERVALS } from '@/types/site'

import type { Interval, SiteInput } from '@/types/site'

export default function SiteForm({ onCreate, busy }: {
  onCreate: (input: SiteInput) => Promise<boolean>,
  busy: boolean,
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const submitInFlight = useRef(false)
  const formId = useId()
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [interval, setInterval] = useState<Interval>(60)
  const [error, setError] = useState('')
  const close = () => {
    if (!submitInFlight.current) setIsOpen(false)
  }
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy || submitInFlight.current) return
    if (!name.trim()) {
      setError('사이트 이름을 입력해 주세요.'); return
    }
    try {
      const parsed = new URL(url.trim())
      if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) throw new Error()
    } catch {
      setError('유효한 HTTPS URL을 입력해 주세요. 예: https://example.com'); return
    }
    if (!INTERVALS.includes(interval)) {
      setError('지원하는 검사 주기를 선택해 주세요.'); return
    }
    setError('')
    submitInFlight.current = true
    setSubmitting(true)
    try {
      if (await onCreate({
        name: name.trim(),
        url: url.trim(),
        intervalSeconds: interval,
      })) {
        setName('')
        setUrl('')
        setInterval(60)
        setIsOpen(false)
      }
    } finally {
      submitInFlight.current = false
      setSubmitting(false)
    }
  }
  return <>
    <button type="button" className="button primary open-site-form" disabled={busy} onClick={() => {
      setError(''); setIsOpen(true)
    }}><Plus size={18} />사이트 추가</button>
    <Popup isOpen={isOpen} onClose={close} pending={submitting} title="새 사이트 등록" className="site-registration-popup" footer={<div className="popup-footer-actions">
      <button type="button" className="button secondary" disabled={submitting} onClick={close}>취소</button>
      <button type="submit" form={formId} className="button primary add-button" disabled={busy || submitting}>{submitting ? <><LoaderCircle size={17} className="spin" />등록 중…</> : <><Plus size={18} />사이트 추가</>}</button>
    </div>}>
      <p className="registration-description">모니터링할 웹사이트의 이름과 HTTPS URL을 입력하세요.</p>
      <form id={formId} onSubmit={event => {
        void submit(event)
      }} noValidate>
        <fieldset disabled={busy || submitting} className="form-grid">
          <label htmlFor="site-name">사이트 이름<input id="site-name" data-popup-autofocus value={name} onChange={event => setName(event.target.value)} placeholder="예: Production API" required maxLength={120} /></label>
          <label htmlFor="site-url">HTTPS URL<input id="site-url" type="url" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://example.com" required /></label>
          <label htmlFor="site-interval">검사 주기<select id="site-interval" value={interval} onChange={event => setInterval(Number(event.target.value) as Interval)}>{INTERVALS.map(seconds => <option key={seconds} value={seconds}>{seconds / 60}분 ({seconds}초)</option>)}</select></label>
        </fieldset>
        {error && <p className="form-error" role="alert">{error}</p>}
      </form>
    </Popup>
  </>
}

