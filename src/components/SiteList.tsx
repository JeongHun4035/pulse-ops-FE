import { ExternalLink, Globe2, LoaderCircle, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import Confirm from '@/components/common/Confirm/Confirm'
import StatusBadge from '@/components/StatusBadge'
import { INTERVALS } from '@/types/site'
import { formatDate, formatMs } from '@/utils/format'

import type { Interval, Site } from '@/types/site'

interface Props {
  sites: Site[],
  selectedIds: number[],
  onToggle: (id: number) => void,
  onSelectAll: (checked: boolean) => void,
  onUpdate: (id: number, interval: Interval) => Promise<boolean>,
  onRemove: (id: number) => Promise<boolean>,
  pending: {
    kind: 'create' | 'update' | 'delete',
    id?: number,
  } | null,
  loading: boolean,
  failed: boolean,
}
export default function SiteList({ sites, selectedIds, onToggle, onSelectAll, onUpdate, onRemove, pending, loading, failed }: Props) {
  const selectAll = useRef<HTMLInputElement>(null)
  const allSelected = sites.length > 0 && sites.every(site => selectedIds.includes(site.id))
  useEffect(() => {
    if (selectAll.current) selectAll.current.indeterminate = selectedIds.length > 0 && !allSelected
  }, [
    selectedIds,
    allSelected,
    loading,
  ])
  const [deleteTarget, setDeleteTarget] = useState<Site | null>(null)
  const [deleting, setDeleting] = useState(false)
  const deleteInFlight = useRef(false)
  const closeDelete = () => {
    if (!deleteInFlight.current) setDeleteTarget(null)
  }
  const confirmDelete = async () => {
    if (!deleteTarget || deleteInFlight.current || pending) return
    deleteInFlight.current = true
    setDeleting(true)
    try {
      if (await onRemove(deleteTarget.id)) setDeleteTarget(null)
    } finally {
      deleteInFlight.current = false
      setDeleting(false)
    }
  }

  return <section className="panel sites-panel">
    <div className="section-heading spread"><div className="flex items-center gap-3"><span className="heading-icon"><Globe2 size={18} /></span><div><h2>모니터링 사이트 <span className="count">{sites.length}</span></h2><p>체크한 사이트의 응답 시간을 함께 비교합니다. · {selectedIds.length}개 선택</p></div></div><span className="quiet-label">30초마다 자동 갱신</span></div>
    {loading ? <div className="empty-state" role="status"><LoaderCircle className="spin" /><h3>사이트를 불러오는 중</h3><p>모니터링 데이터를 확인하고 있습니다.</p></div> :
      sites.length === 0 ? <div className="empty-state"><Globe2 size={32} /><h3>{failed ? '사이트 목록을 불러올 수 없습니다' : '첫 번째 사이트를 등록해 보세요'}</h3><p>{failed ? 'API 연결을 확인한 뒤 새로고침해 주세요.' : '사이트 추가 버튼으로 웹사이트를 등록하면 상태와 응답 시간을 확인할 수 있습니다.'}</p></div> :
        <div className="table-scroll"><table><thead><tr><th className="checkbox-cell"><input ref={selectAll} className="site-checkbox" type="checkbox" aria-label="모든 사이트 차트 선택" checked={allSelected} onChange={event => onSelectAll(event.target.checked)} /></th><th>사이트</th><th>현재 상태</th><th>HTTP</th><th>응답 시간</th><th>검사 주기</th><th>마지막 검사</th><th>다음 검사</th><th><span className="sr-only">삭제</span></th></tr></thead><tbody>{sites.map(site => <tr key={site.id} className={selectedIds.includes(site.id) ? 'selected-row' : ''}>
          <td className="checkbox-cell"><input className="site-checkbox" type="checkbox" aria-label={site.name + ' 차트 선택'} checked={selectedIds.includes(site.id)} onChange={() => onToggle(site.id)} /></td>
          <td><div className="site-identity"><span className="site-avatar"><Globe2 size={17} /></span><div><button className="site-select" aria-pressed={selectedIds.includes(site.id)} onClick={() => onToggle(site.id)}>{site.name}</button><a href={/^https:\/\//i.test(site.url) ? site.url : undefined} target="_blank" rel="noreferrer">{site.url}<ExternalLink size={10} /></a>{!site.lastCheckedAt && <small>검사 결과 대기 중</small>}{!site.enabled && <small>모니터링 일시 중지</small>}</div></div></td>
          <td><StatusBadge status={site.status} /></td><td className="mono">{site.httpStatusCode ?? '—'}</td><td className="mono">{formatMs(site.responseTimeMs)}</td>
          <td><select aria-label={site.name + ' 검사 주기'} value={site.intervalSeconds} disabled={pending !== null} onChange={event => {
            void onUpdate(site.id, Number(event.target.value) as Interval)
          }}>{!INTERVALS.some(value => value === site.intervalSeconds) && <option value={site.intervalSeconds}>{site.intervalSeconds}초</option>}{INTERVALS.map(seconds => <option key={seconds} value={seconds}>{seconds / 60}분</option>)}</select>{pending?.kind === 'update' && pending.id === site.id && <small role="status">변경 중…</small>}</td>
          <td className="timestamp">{formatDate(site.lastCheckedAt)}</td><td className="timestamp">{site.enabled ? formatDate(site.nextCheckAt) : '일시 중지'}</td>
          <td><button className="icon-button danger" aria-label={site.name + ' 삭제'} disabled={pending !== null} onClick={() => {
            setDeleteTarget(site)
          }}>{pending?.kind === 'delete' && pending.id === site.id ? <LoaderCircle size={16} className="spin" /> : <Trash2 size={16} />}</button></td>
        </tr>)}</tbody></table></div>}
    <Confirm
      isOpen={deleteTarget !== null}
      onClose={closeDelete}
      onConfirm={() => {
        void confirmDelete()
      }}
      pending={deleting}
      className="site-delete-confirm"
      title="사이트 삭제"
      contents={<div className="delete-confirm-message"><p><strong>{deleteTarget?.name}</strong> 사이트를 삭제하시겠습니까?</p><p className="delete-confirm-url">{deleteTarget?.url}</p><p>삭제 후 모니터링이 중단됩니다.</p></div>}
      footer={<div className="confirm-footer-actions">
        <button type="button" className="button secondary" data-confirm-cancel disabled={deleting} onClick={closeDelete}>취소</button>
        <button type="button" className="button delete-confirm-button" disabled={deleting || pending !== null} onClick={() => {
          void confirmDelete()
        }}>{deleting ? <><LoaderCircle size={16} className="spin" />삭제 중…</> : <><Trash2 size={16} />삭제</>}</button>
      </div>}
    />
  </section>
}

