export function formatDate(value: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) return '검사 대기'
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(value))
}
export function formatTime(value: string | number): string {
  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))
}
export function formatMs(value: number | null): string {
  return value === null ? '—' : value.toLocaleString('ko-KR') + ' ms'
}
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.'
}

