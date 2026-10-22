import { RotateCcw, Search } from 'lucide-react'
import { useState } from 'react'

import DatePicker from '@/components/common/DatePicker/DatePicker'
import { formatDate } from '@/utils/date'

import type { HistoryDateRange } from '@/types/site'

export default function HistoryRangePicker({ applied, onApply }: {
  applied: HistoryDateRange | null,
  onApply: (range: HistoryDateRange | null) => void,
}) {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [error, setError] = useState('')
  const today = formatDate(new Date())
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!startDate || !endDate) {
      setError('시작일과 종료일을 모두 선택해 주세요.'); return
    }
    if (startDate > endDate) {
      setError('종료일은 시작일 이후여야 합니다.'); return
    }
    setError('')
    onApply({
      startDate,
      endDate,
    })
  }
  return <div className="history-range-picker">
    <form onSubmit={submit} className="history-range-form">
      <DatePicker id="history-start" label="시작일" value={startDate} onChange={setStartDate} max={endDate || today} />
      <span className="date-range-separator" aria-hidden="true">~</span>
      <DatePicker id="history-end" label="종료일" value={endDate} onChange={setEndDate} {...(startDate ? { min: startDate } : {})} max={today} />
      <button className="button primary history-query" type="submit"><Search size={15} />조회</button>
      <button className="button secondary history-reset" type="button" onClick={() => {
        setStartDate(''); setEndDate(''); setError(''); onApply(null)
      }}><RotateCcw size={15} />초기화</button>
    </form>
    {error && <p className="form-error" role="alert">{error}</p>}
    <p className="history-mode" role="status">{applied ? applied.startDate + ' ~ ' + applied.endDate + ' · 지정 기간 조회 (종료일 포함)' : '실시간 조회 · 30초 자동 갱신'}</p>
  </div>
}

