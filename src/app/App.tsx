import { Activity, AlertTriangle, Radio } from 'lucide-react'
import { lazy, Suspense } from 'react'

import Header from '@/components/Header'
import SiteForm from '@/components/SiteForm'
import SiteList from '@/components/SiteList'
import SummaryCards from '@/components/SummaryCards'
import { useSites } from '@/hooks/useSites'

const ResponseTimeChart = lazy(() => import('@/components/ResponseTimeChart'))

export default function App() {
  const state = useSites()
  const selectedSites = state.sites.filter(item => state.selectedIds.includes(item.id))
  return <div className="pulseops">
    <Header updatedAt={state.updatedAt} refreshing={state.refreshing} onRefresh={state.refresh} />
    <main className="dashboard-shell">
      <div className="page-heading"><div><div className="eyebrow"><span /> PULSEOPS / OVERVIEW</div><h1>서비스 모니터링</h1><p>웹사이트의 현재 상태와 성능을 한눈에 확인하세요.</p></div><div className="page-actions"><span className="polling-label"><Radio size={15} />자동 갱신 · 30초</span><SiteForm onCreate={state.create} busy={state.pending !== null} /></div></div>
      {state.error && <div className="notice error" role="alert"><AlertTriangle size={18} /><span>{state.error}{state.updatedAt && ' 마지막으로 조회한 데이터를 표시합니다.'}</span><button onClick={state.refresh} disabled={state.refreshing}>다시 시도</button></div>}
      <SummaryCards sites={state.sites} loading={state.loading} available={state.updatedAt !== null} />
      <SiteList sites={state.sites} selectedIds={state.selectedIds} onToggle={state.toggleSite} onSelectAll={state.selectAll} onUpdate={state.update} onRemove={state.remove} pending={state.pending} loading={state.loading} failed={Boolean(state.error)} />
      <Suspense fallback={<section className="panel empty-state" role="status">응답 시간 차트를 준비하고 있습니다.</section>}>
        <ResponseTimeChart sites={selectedSites} histories={state.histories} range={state.historyRange} onRangeChange={state.setHistoryRange} loading={state.historyLoading} errors={state.historyErrors} dateRange={state.dateRange} onDateRangeChange={state.applyDateRange} />
      </Suspense>
      <footer className="dashboard-footer"><span><Activity size={14} />PulseOps <span className="separator">/</span> Website Monitoring</span><span>시간은 브라우저의 현지 시간대로 표시됩니다.</span></footer>
    </main>
  </div>
}

