import type { HistoryDateRange, HistoryPoint, HistoryRange, Site, SiteInput, SiteStatus, Interval } from '@/types/site'

const baseUrl = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '')
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('API 응답 형식이 올바르지 않습니다.')
  return value as Record<string, unknown>
}
function unwrap(value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value) && 'data' in value) return record(value).data
  return value
}
function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
function dateOrNull(value: unknown): string | null {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null
}
function status(value: unknown): SiteStatus {
  return value === 'UP' || value === 'DOWN' ? value : 'UNKNOWN'
}
function point(value: unknown): HistoryPoint {
  const row = record(value)
  const checkedAt = dateOrNull(row.checkedAt)
  if (!checkedAt) throw new Error('검사 이력의 시간이 올바르지 않습니다.')
  return {
    checkedAt,
    status: status(row.status),
    httpStatusCode: numberOrNull(row.httpStatusCode),
    responseTimeMs: numberOrNull(row.responseTimeMs),
  }
}
function site(value: unknown): Site {
  const row = record(value)
  if (typeof row.id !== 'number' || typeof row.name !== 'string' || typeof row.url !== 'string' || typeof row.intervalSeconds !== 'number') {
    throw new Error('사이트 API 응답의 필수 필드를 확인해 주세요.')
  }
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    intervalSeconds: row.intervalSeconds,
    enabled: row.enabled !== false,
    status: status(row.status),
    httpStatusCode: numberOrNull(row.httpStatusCode),
    responseTimeMs: numberOrNull(row.responseTimeMs),
    lastCheckedAt: dateOrNull(row.lastCheckedAt),
    nextCheckAt: dateOrNull(row.nextCheckAt),
  }
}
async function request(path: string, signal: AbortSignal, method = 'GET', body?: unknown): Promise<unknown> {
  const timeout = AbortSignal.timeout(15000)
  let response: Response
  try {
    response = await fetch(baseUrl + '/v1' + path, {
      method,
      signal: AbortSignal.any([signal, timeout]),
      headers: body === undefined ? { Accept: 'application/json' } : {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  } catch (error) {
    if (signal.aborted) throw error
    throw new Error(timeout.aborted ? '요청 시간이 초과되었습니다. 다시 시도해 주세요.' : 'API에 연결할 수 없습니다. 백엔드 실행 및 CORS 설정을 확인해 주세요.')
  }
  if (!response.ok) {
    let message = '요청에 실패했습니다.'
    try {
      const payload = record(await response.json())
      if (typeof payload.message === 'string') message = payload.message
    } catch { /* A non-JSON error still includes the HTTP status. */ }
    throw new Error(message + ' (HTTP ' + response.status + ')')
  }
  if (method !== 'GET') return undefined
  try {
    return unwrap(await response.json())
  } catch {
    throw new Error('API JSON 응답을 읽을 수 없습니다.')
  }
}
export const siteApi = {
  async list(signal: AbortSignal): Promise<Site[]> {
    const payload = await request('/sites', signal)
    const rows = Array.isArray(payload) ? payload : record(payload).content ?? record(payload).sites
    if (!Array.isArray(rows)) throw new Error('사이트 목록 응답이 배열이 아닙니다.')
    return rows.map(site)
  },
  async history(id: number, range: HistoryRange, signal: AbortSignal, dateRange: HistoryDateRange | null = null): Promise<HistoryPoint[]> {
    // Fetch enough history for six X-axis intervals, rather than treating the interval as a lookback.
    const query = dateRange ? 'all=true' : range === '1m' ? 'minutes=30' : range === '5m' ? 'hours=1' : range === '30m' || range === '1h' ? 'hours=6' : 'all=true'
    const payload = await request('/sites/' + id + '/history?' + query, signal)
    const rows = Array.isArray(payload) ? payload : record(payload).history
    if (!Array.isArray(rows)) throw new Error('검사 이력 응답이 배열이 아닙니다.')
    const result = rows.map(point).sort((a, b) => Date.parse(a.checkedAt) - Date.parse(b.checkedAt))
    if (!dateRange) return result
    const start = new Date(dateRange.startDate + 'T00:00:00').getTime()
    const end = new Date(dateRange.endDate + 'T00:00:00')
    end.setDate(end.getDate() + 1)
    return result.filter(row => Date.parse(row.checkedAt) >= start && Date.parse(row.checkedAt) < end.getTime())
  },
  async create(input: SiteInput, signal: AbortSignal) {
    await request('/sites', signal, 'POST', input)
  },
  async update(id: number, intervalSeconds: Interval, signal: AbortSignal) {
    await request('/sites/' + id, signal, 'PATCH', { intervalSeconds })
  },
  async remove(id: number, signal: AbortSignal) {
    await request('/sites/' + id, signal, 'DELETE')
  },
}

