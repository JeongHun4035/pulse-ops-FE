import { ArrowUpRight, CircleCheck, CircleX, Globe2 } from 'lucide-react'

import type { Site } from '@/types/site'

export default function SummaryCards({ sites, loading, available }: {
  sites: Site[],
  loading: boolean,
  available: boolean,
}) {
  const cards = [
    {
      label: '전체 등록 사이트',
      value: sites.length,
      icon: Globe2,
      tone: 'blue',
      description: 'All monitored websites',
    },
    {
      label: '정상 사이트',
      value: sites.filter(site => site.status === 'UP').length,
      icon: CircleCheck,
      tone: 'green',
      description: 'UP · 정상적으로 응답 중',
    },
    {
      label: '장애 사이트',
      value: sites.filter(site => site.status === 'DOWN').length,
      icon: CircleX,
      tone: 'red',
      description: 'DOWN · 확인이 필요한 사이트',
    },
  ]
  const unknown = sites.filter(site => site.status === 'UNKNOWN').length
  return <div className="summary-grid">{cards.map(({ label, value, icon: Icon, tone, description }, i) =>
    <section className={'summary-card ' + tone} key={label}>
      <div className="summary-top"><span>{label}</span><span className="summary-icon"><Icon size={19} /></span></div>
      <div className="summary-value">{loading || !available ? '—' : value}<span>sites</span></div>
      <div className="summary-bottom"><span>{i === 0 && unknown > 0 ? 'UNKNOWN · 검사 대기 ' + unknown + '개 포함' : description}</span>{i === 0 && <ArrowUpRight size={14} />}</div>
    </section>)}</div>
}

