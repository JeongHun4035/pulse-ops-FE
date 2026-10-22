import type { SiteStatus } from '@/types/site'

export default function StatusBadge({ status }: { status: SiteStatus }) {
  return <span className={'status status-' + status.toLowerCase()}><span aria-hidden="true" />{status}</span>
}

