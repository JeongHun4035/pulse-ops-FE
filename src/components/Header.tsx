import { Activity, RefreshCw } from 'lucide-react'

import { formatDate } from '@/utils/format'

export default function Header({ updatedAt, refreshing, onRefresh }: {
  updatedAt: string | null,
  refreshing: boolean,
  onRefresh: () => void,
}) {
  return <header className="topbar">
    <a className="brand" href="/" aria-label="PulseOps 대시보드"><span className="brand-icon"><Activity size={23} /></span><span>Pulse<span className="brand-light">Ops</span><small>WEBSITE MONITORING</small></span></a>
    <div className="header-actions"><div className="last-update"><span>마지막 데이터 갱신</span><strong>{updatedAt ? formatDate(updatedAt) : '아직 갱신되지 않음'}</strong></div>
      <button className="button secondary" onClick={onRefresh} disabled={refreshing}><RefreshCw size={15} className={refreshing ? 'spin' : ''} />{refreshing ? '갱신 중' : '새로고침'}</button>
    </div>
  </header>
}

