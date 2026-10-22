import { Activity, ChartNoAxesCombined, LoaderCircle } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import HistoryRangePicker from '@/components/HistoryRangePicker'
import StatusBadge from '@/components/StatusBadge'
import { HISTORY_RANGES } from '@/types/site'
import { formatDate, formatTime } from '@/utils/format'

import type { HistoryDateRange, HistoryRange, Site, SiteHistories } from '@/types/site'

interface Props {
  sites: Site[],
  histories: SiteHistories,
  range: HistoryRange,
  onRangeChange: (range: HistoryRange) => void,
  loading: boolean,
  errors: Record<number, string>,
  dateRange: HistoryDateRange | null,
  onDateRangeChange: (range: HistoryDateRange | null) => void,
}
const COLORS = [
  '#38bdf8',
  '#a78bfa',
  '#34d399',
  '#fbbf24',
  '#fb923c',
  '#f472b6',
  '#2dd4bf',
  '#818cf8',
]
export default function ResponseTimeChart({ sites, histories, range, onRangeChange, loading, errors, dateRange, onDateRangeChange }: Props) {
  const rangeLabel = HISTORY_RANGES.find(item => item.value === range)?.label ?? range
  const now = Date.now()
  const tickDuration = Number.parseInt(range, 10) * (range.endsWith('m') ? 60_000 : 3_600_000)
  const timezoneOffset = new Date(now).getTimezoneOffset() * 60_000
  const endDate = dateRange ? new Date(dateRange.endDate + 'T00:00:00') : null
  endDate?.setDate(endDate.getDate() + 1)
  const windowEnd = endDate?.getTime() ?? Math.ceil((now - timezoneOffset) / tickDuration) * tickDuration + timezoneOffset
  const windowStart = dateRange ? new Date(dateRange.startDate + 'T00:00:00').getTime() : windowEnd - tickDuration * 6
  const tickMultiple = Math.max(1, Math.ceil((windowEnd - windowStart) / tickDuration / 60))
  const displayStep = tickDuration * tickMultiple
  const firstTick = Math.ceil((windowStart - timezoneOffset) / displayStep) * displayStep + timezoneOffset
  const timeTicks = dateRange ? Array.from({ length: Math.max(0, Math.floor((windowEnd - firstTick) / displayStep) + 1) }, (_, index) => firstTick + displayStep * index) : Array.from({ length: 7 }, (_, index) => windowStart + tickDuration * index)
  const showDate = new Date(windowStart).toDateString() !== new Date(windowEnd).toDateString()
  const series = sites.map(site => ({
    site,
    color: COLORS[Math.abs(site.id) % COLORS.length] ?? '#38bdf8',
    data: (histories[site.id] ?? []).map(point => ({
      ...point,
      time: Date.parse(point.checkedAt),
    })).filter(point => point.time >= windowStart && point.time < windowEnd && point.time <= now),
  }))
  const points = series.flatMap(item => item.data)
  const times = [...new Set(points.map(point => point.time))].sort((a, b) => a - b).map(time => ({ time }))
  const failures = series.flatMap(item => item.data.filter(point => point.status === 'DOWN').map(point => ({
    ...point,
    site: item.site,
  })))
  const hasErrors = sites.some(site => errors[site.id])
  return <section className="panel chart-panel">
    <div className="section-heading spread"><div className="flex items-center gap-3"><span className="heading-icon"><Activity size={18} /></span><div><h2>응답 시간 <span className="unit">Response time</span></h2><p>{sites.length ? sites.length + '개 사이트 비교 · X축 간격 ' + rangeLabel : '목록에서 체크박스로 비교할 사이트를 선택하세요.'}</p></div></div>
      <div className="range-control" aria-label="X축 눈금 간격">{HISTORY_RANGES.map(item => <button key={item.value} aria-pressed={range === item.value} className={range === item.value ? 'active' : ''} onClick={() => onRangeChange(item.value)}>{item.label}</button>)}</div>
    </div>
    <HistoryRangePicker applied={dateRange} onApply={onDateRangeChange} />
    {tickMultiple > 1 && <p className="history-tick-note">넓은 조회 기간은 눈금을 {tickMultiple}배 간격으로 표시합니다. 실제 검사 데이터는 그대로 유지됩니다.</p>}
    {sites.filter(site => errors[site.id]).map(site => <div className="inline-error" role="alert" key={site.id}>{site.name}: {errors[site.id]} {histories[site.id] && '이전 조회 데이터를 표시합니다.'}</div>)}
    <div className="chart-meta"><span>응답 시간 <span className="unit">(ms)</span></span><span>{loading && <><LoaderCircle size={13} className="spin" /><span role="status">갱신 중</span></>}<span className="quiet-label">{rangeLabel} 간격</span></span></div>
    {series.length > 0 && <ul className="chart-series-legend" aria-label="비교 사이트">{series.map(item => <li key={item.site.id}><i style={{ background: item.color }} /><span>{item.site.name}</span><StatusBadge status={item.site.status} />{!loading && !errors[item.site.id] && item.data.length === 0 && <small>이력 없음</small>}</li>)}</ul>}
    {points.length === 0 ? <div className="empty-state chart-empty" role="status">{loading ? <LoaderCircle className="spin" size={32} /> : <ChartNoAxesCombined size={36} />}<h3>{loading ? '검사 이력을 불러오는 중' : hasErrors ? '이력을 불러오지 못했습니다' : sites.length ? '아직 검사 이력이 없습니다' : '모니터링할 사이트를 선택하세요'}</h3><p>{sites.length ? '선택한 기간의 실제 검사 결과가 이곳에 표시됩니다.' : '목록에서 사이트를 체크하면 비교 대상이 추가됩니다.'}</p></div> :
      <div className="chart-canvas" role="img" aria-label={sites.map(site => site.name).join(', ') + ' X축 ' + rangeLabel + ' 간격 응답 시간 차트. 검사 ' + points.length + '건, 실패 ' + failures.length + '건.'}>
        <div className="chart-plot"><ResponsiveContainer width="100%" height="100%">
          <LineChart data={times} margin={{
            top: 18,
            right: 28,
            left: 8,
            bottom: 12,
          }}>
            <CartesianGrid stroke="#26313f" strokeDasharray="3 5" vertical={false} />
            <XAxis dataKey="time" type="number" scale="time" domain={[windowStart, windowEnd]} ticks={timeTicks} interval="preserveStartEnd" minTickGap={24} allowDataOverflow tickFormatter={value => {
              const date = new Date(Number(value))
              const day = String(date.getMonth() + 1).padStart(2, '0') + '/' + String(date.getDate()).padStart(2, '0')
              if (range === '24h') return day
              return (showDate ? day + ' ' : '') + formatTime(Number(value))
            }} stroke="#7e8da4" tickLine={false} axisLine={false} tickMargin={14} height={44} padding={{
              left: 12,
              right: 12,
            }} tick={{ fontSize: 11 }} />
            <YAxis stroke="#7e8da4" tickLine={false} axisLine={false} tickMargin={10} tick={{ fontSize: 11 }} width={56} domain={[0, 'auto']} />
            <Tooltip contentStyle={{
              background: '#151e2b',
              border: '1px solid #344155',
              borderRadius: 8,
              color: '#e5edf8',
            }} labelFormatter={label => formatDate(new Date(Number(label)).toISOString())} formatter={(value, name) => [value === null ? '측정값 없음' : String(value) + ' ms', name]} />
            {failures.map((point, index) => <ReferenceLine key={point.site.id + '-' + point.checkedAt + '-' + index} x={point.time} stroke="#f87171" strokeDasharray="3 4" />)}
            {series.map(item => <Line key={item.site.id} data={item.data} name={item.site.name} type="linear" dataKey="responseTimeMs" stroke={item.color} strokeWidth={2.5} connectNulls={false} isAnimationActive={false} dot={{
              r: 3,
              fill: item.color,
              strokeWidth: 0,
            }} activeDot={{ r: 5 }} />)}
          </LineChart>
        </ResponsiveContainer></div>
      </div>}
    <div className="chart-footer"><span>선택 {sites.length}개 <span className="separator">/</span> 검사 {points.length}건 <span className="separator">/</span> 실패 <span className={failures.length ? 'text-red' : ''}>{failures.length}건</span></span><span>결측값은 연결하지 않으며, 빨간 점선은 DOWN 검사입니다.</span></div>
    {failures.length > 0 && <details className="failure-details"><summary>실패 검사 {failures.length}건 확인</summary><ul>{failures.map((point, index) => <li key={point.site.id + '-' + point.checkedAt + '-' + index}>{point.site.name} · {formatDate(point.checkedAt)} · DOWN · HTTP {point.httpStatusCode ?? '응답 없음'} · {point.responseTimeMs === null ? '응답 시간 없음' : point.responseTimeMs + ' ms'}</li>)}</ul></details>}
  </section>
}

