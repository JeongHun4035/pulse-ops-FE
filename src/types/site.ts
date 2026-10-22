export const INTERVALS = [
  60,
  300,
  600,
] as const
export type Interval = (typeof INTERVALS)[number]
export type SiteStatus = 'UP' | 'DOWN' | 'UNKNOWN'
export interface Site {
  id: number,
  name: string,
  url: string,
  intervalSeconds: number,
  enabled: boolean,
  status: SiteStatus,
  httpStatusCode: number | null,
  responseTimeMs: number | null,
  lastCheckedAt: string | null,
  nextCheckAt: string | null,
}
export interface SiteInput {
  name: string,
  url: string,
  intervalSeconds: Interval,
}
export interface HistoryPoint {
  checkedAt: string,
  status: SiteStatus,
  httpStatusCode: number | null,
  responseTimeMs: number | null,
}
export const HISTORY_RANGES = [
  {
    value: '1m',
    label: '1분',
  },
  {
    value: '5m',
    label: '5분',
  },
  {
    value: '30m',
    label: '30분',
  },
  {
    value: '1h',
    label: '1시간',
  },
  {
    value: '6h',
    label: '6시간',
  },
  {
    value: '24h',
    label: '24시간',
  },
] as const
export type HistoryRange = (typeof HISTORY_RANGES)[number]['value']
export type SiteHistories = Record<number, HistoryPoint[]>
export interface HistoryDateRange {
  startDate: string,
  endDate: string,
}

