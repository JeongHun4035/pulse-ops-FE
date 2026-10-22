export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  params?: Record<string, string | number | boolean | null | undefined>,
  /** JSON으로 전송할 요청 데이터 */
  body?: unknown,
  headers?: Record<string, string>,
  signal?: AbortSignal,
  timeout?: number,
}

export const apiConfig = {
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 15000,
}

export class ApiError extends Error {
  readonly status: number
  readonly data: unknown

  constructor(status: number, data: unknown) {
    super(`API 요청에 실패했습니다. (${status})`)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

export function getRequestURL(path: string, params?: RequestOptions['params']): string {
  const baseURL = apiConfig.baseURL.replace(/\/+$/, '')
  const relativePath = /\/api$/.test(baseURL) ? path.replace(/^\/?api(?=\/|$)/, '') : path
  const target = /^https?:\/\//i.test(path) ?
    path :
    `${baseURL}/${relativePath.replace(/^\/+/, '')}`
  const url = new URL(target, window.location.origin)
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value))
  }
  return url.toString()
}
