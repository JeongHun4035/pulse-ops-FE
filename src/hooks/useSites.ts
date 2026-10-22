import { useCallback, useEffect, useRef, useState } from 'react'

import { useToast } from '@/hooks/useToast'
import { siteApi } from '@/services/siteApi'
import { errorMessage } from '@/utils/format'

import type { HistoryDateRange, HistoryRange, SiteHistories, Interval, Site, SiteInput } from '@/types/site'

interface ReadRequest {
  controller: AbortController,
  promise: Promise<void>,
}

export function useSites() {
  const { toast } = useToast()
  const [sites, setSites] = useState<Site[]>([])
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [historyRange, setHistoryRange] = useState<HistoryRange>('24h')
  const [dateRange, setDateRange] = useState<HistoryDateRange | null>(null)
  const customRange = useRef<HistoryDateRange | null>(null)
  const [histories, setHistories] = useState<SiteHistories>({})
  const [historyErrors, setHistoryErrors] = useState<Record<number, string>>({})
  const [historyLoadingIds, setHistoryLoadingIds] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [pending, setPending] = useState<{
    kind: 'create' | 'update' | 'delete',
    id?: number,
  } | null>(null)
  const listRequest = useRef<ReadRequest | null>(null)
  const chartRequests = useRef(new Map<number, ReadRequest>())
  const refreshCycle = useRef<Promise<void> | null>(null)
  const mutation = useRef<AbortController | null>(null)
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mounted = useRef(false)
  const selected = useRef<number[]>([])
  const selectionInitialized = useRef(false)
  const range = useRef<HistoryRange>('24h')
  const cachedHistories = useRef<SiteHistories>({})

  const stopPolling = useCallback(() => {
    if (pollTimer.current !== null) clearTimeout(pollTimer.current)
    pollTimer.current = null
  }, [])

  const applySelection = useCallback((ids: number[]) => {
    if (ids.length === selected.current.length && ids.every((id, index) => id === selected.current[index])) return
    selected.current = ids
    for (const [id, request] of chartRequests.current) {
      if (!ids.includes(id)) {
        request.controller.abort()
        chartRequests.current.delete(id)
      }
    }
    cachedHistories.current = Object.fromEntries(Object.entries(cachedHistories.current).filter(([id]) => ids.includes(Number(id))))
    setHistories(cachedHistories.current)
    setHistoryErrors(current => Object.fromEntries(Object.entries(current).filter(([id]) => ids.includes(Number(id)))))
    setHistoryLoadingIds(current => current.filter(id => ids.includes(id)))
    setSelectedIds(ids)
  }, [])

  const refreshSites = useCallback((): Promise<void> => {
    if (listRequest.current) return listRequest.current.promise
    const controller = new AbortController()
    setRefreshing(true)
    const promise = (async () => {
      try {
        const rows = await siteApi.list(controller.signal)
        if (controller.signal.aborted || !mounted.current) return
        const firstSite = rows[0]
        const nextIds = !selectionInitialized.current && firstSite ?
          [firstSite.id] :
          selected.current.filter(id => rows.some(row => row.id === id))
        if (rows.length > 0) selectionInitialized.current = true
        applySelection(nextIds)
        setSites(rows)
        setError('')
        setUpdatedAt(new Date().toISOString())
      } catch (err) {
        if (!controller.signal.aborted && mounted.current) setError(errorMessage(err))
      } finally {
        if (listRequest.current?.controller === controller) listRequest.current = null
        if (!controller.signal.aborted && mounted.current) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    })()
    listRequest.current = {
      controller,
      promise,
    }
    return promise
  }, [applySelection])

  const refreshHistory = useCallback(async (force = true): Promise<void> => {
    const queryRange = range.current
    const queryDates = customRange.current
    await Promise.all(selected.current.map(id => {
      const active = chartRequests.current.get(id)
      if (active) return active.promise
      if (!force && Object.hasOwn(cachedHistories.current, id)) return Promise.resolve()
      const controller = new AbortController()
      setHistoryLoadingIds(current => current.includes(id) ? current : [...current, id])
      const promise = (async () => {
        try {
          const rows = await siteApi.history(id, queryRange, controller.signal, queryDates)
          if (controller.signal.aborted || !mounted.current || (!queryDates && queryRange !== range.current) || queryDates !== customRange.current || !selected.current.includes(id)) return
          cachedHistories.current = {
            ...cachedHistories.current,
            [id]: rows,
          }
          setHistories(cachedHistories.current)
          setHistoryErrors(current => {
            const next = { ...current }
            delete next[id]
            return next
          })
        } catch (err) {
          if (!controller.signal.aborted && mounted.current && (queryDates || queryRange === range.current) && queryDates === customRange.current && selected.current.includes(id)) {
            setHistoryErrors(current => ({
              ...current,
              [id]: errorMessage(err),
            }))
          }
        } finally {
          if (chartRequests.current.get(id)?.controller === controller) {
            chartRequests.current.delete(id)
            if (mounted.current) setHistoryLoadingIds(current => current.filter(value => value !== id))
          }
        }
      })()
      chartRequests.current.set(id, {
        controller,
        promise,
      })
      return promise
    }))
  }, [])

  const refreshAll = useCallback((): Promise<void> => {
    if (mutation.current || !mounted.current) return Promise.resolve()
    if (refreshCycle.current) return refreshCycle.current
    const ids = selected.current
    const promise = (async () => {
      await refreshSites()
      // Changed selections are loaded once by their effect; unchanged selections refresh here.
      if (mounted.current && !mutation.current && selected.current === ids && !customRange.current) await refreshHistory()
    })().finally(() => {
      if (refreshCycle.current === promise) refreshCycle.current = null
    })
    refreshCycle.current = promise
    return promise
  }, [refreshSites, refreshHistory])

  const schedulePolling = useCallback(function schedule() {
    stopPolling()
    if (!mounted.current || mutation.current) return
    pollTimer.current = setTimeout(() => {
      void refreshAll().finally(schedule)
    }, 30000)
  }, [refreshAll, stopPolling])

  useEffect(() => {
    mounted.current = true
    const initialTimer = setTimeout(() => {
      void refreshAll().finally(schedulePolling)
    }, 0)
    const requests = chartRequests.current
    return () => {
      mounted.current = false
      clearTimeout(initialTimer)
      stopPolling()
      listRequest.current?.controller.abort()
      listRequest.current = null
      for (const request of requests.values()) request.controller.abort()
      requests.clear()
      refreshCycle.current = null
      mutation.current?.abort()
    }
  }, [
    refreshAll,
    schedulePolling,
    stopPolling,
  ])

  useEffect(() => {
    const selectionTimer = setTimeout(() => {
      void refreshHistory(false).finally(schedulePolling)
    }, 0)
    return () => clearTimeout(selectionTimer)
  }, [
    selectedIds,
    historyRange,
    dateRange,
    refreshHistory,
    schedulePolling,
  ])

  const mutate = async (kind: 'create' | 'update' | 'delete', action: (signal: AbortSignal) => Promise<void>, id?: number): Promise<boolean> => {
    if (mutation.current) return false
    const controller = new AbortController()
    mutation.current = controller
    stopPolling()
    setPending(id === undefined ? { kind } : {
      kind,
      id,
    })
    try {
      await listRequest.current?.promise
      if (controller.signal.aborted || !mounted.current) return false
      await action(controller.signal)
      if (controller.signal.aborted || !mounted.current) return false
      toast(kind === 'create' ? '사이트가 등록되었습니다.' : kind === 'delete' ? '사이트가 삭제되었습니다.' : '검사 주기가 변경되었습니다.', { variant: 'success' })
      await refreshSites()
      return true
    } catch (err) {
      if (!controller.signal.aborted && mounted.current) toast(errorMessage(err), {
        variant: 'error',
        duration: 5000,
      })
      return false
    } finally {
      if (mutation.current === controller) mutation.current = null
      if (mounted.current) {
        setPending(null)
        schedulePolling()
      }
    }
  }
  return {
    sites,
    selectedIds,
    historyRange,
    dateRange,
    applyDateRange: (value: HistoryDateRange | null) => {
      stopPolling()
      customRange.current = value
      for (const request of chartRequests.current.values()) request.controller.abort()
      chartRequests.current.clear()
      cachedHistories.current = {}
      setHistories({})
      setHistoryErrors({})
      setHistoryLoadingIds([])
      if (!value) {
        range.current = '24h'
        setHistoryRange('24h')
      }
      setDateRange(value)
      if (!value && !dateRange && historyRange === '24h') void refreshHistory().finally(schedulePolling)
    },
    histories,
    historyErrors,
    historyLoading: historyLoadingIds.length > 0,
    loading,
    refreshing,
    error,
    updatedAt,
    pending,
    toggleSite: (id: number) => {
      selectionInitialized.current = true
      applySelection(selected.current.includes(id) ? selected.current.filter(value => value !== id) : [...selected.current, id])
    },
    selectAll: (checked: boolean) => {
      selectionInitialized.current = true
      applySelection(checked ? sites.map(site => site.id) : [])
    },
    setHistoryRange: (value: HistoryRange) => {
      if (value === range.current) return
      stopPolling()
      range.current = value
      if (customRange.current) {
        setHistoryRange(value)
        schedulePolling()
        return
      }
      for (const request of chartRequests.current.values()) request.controller.abort()
      chartRequests.current.clear()
      cachedHistories.current = {}
      setHistories({})
      setHistoryErrors({})
      setHistoryLoadingIds([])
      setHistoryRange(value)
    },
    refresh: () => {
      if (mutation.current) return
      stopPolling()
      void refreshAll().finally(schedulePolling)
      if (customRange.current) void refreshHistory()
    },
    create: (input: SiteInput) => mutate('create', signal => siteApi.create(input, signal)),
    update: (id: number, interval: Interval) => mutate('update', signal => siteApi.update(id, interval, signal), id),
    remove: (id: number) => mutate('delete', signal => siteApi.remove(id, signal), id),
  }
}

