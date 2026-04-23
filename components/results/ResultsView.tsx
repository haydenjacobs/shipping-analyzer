'use client'

import { useCallback, useEffect, useState } from 'react'
import { ResultsContent, type ResultsPayload } from './ResultsContent'
import { ShareButton } from './ShareButton'
import { useDebouncedAnalysisPatch } from '@/lib/hooks/useDebouncedPatch'
import type { ViewMode } from '@/lib/results/derive-table'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'loaded'; payload: ResultsPayload }
  | { kind: 'not_calculated' }
  | { kind: 'too_large' }
  | { kind: 'error'; message: string }

interface Props {
  analysisId: number
  onNotCalculated?: () => React.ReactNode
}

export function ResultsView({ analysisId, onNotCalculated }: Props) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [mode, setMode] = useState<ViewMode>('optimized')
  const [excluded, setExcluded] = useState<number[]>([])
  const [projectedOrderCount, setProjectedOrderCount] = useState<number | null>(null)
  const [projectedPeriod, setProjectedPeriod] = useState<'month' | 'year'>('year')
  const [saveError, setSaveError] = useState<string | null>(null)

  const patcher = useDebouncedAnalysisPatch(analysisId, 500, () => {
    setSaveError("Couldn't save your changes — reload to sync.")
  })

  const load = useCallback(async () => {
    setState({ kind: 'loading' })
    try {
      const res = await fetch(`/api/analyses/${analysisId}/results`)
      if (res.status === 409) { setState({ kind: 'not_calculated' }); return }
      if (res.status === 413) { setState({ kind: 'too_large' }); return }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setState({ kind: 'error', message: body?.error?.message ?? 'Failed to load results' })
        return
      }
      const payload = (await res.json()) as ResultsPayload
      setState({ kind: 'loaded', payload })
      setMode(payload.analysis.viewMode)
      setExcluded(payload.analysis.excludedLocations)
      setProjectedOrderCount(payload.analysis.projectedOrderCount)
      setProjectedPeriod(payload.analysis.projectedPeriod)
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : 'Network error' })
    }
  }, [analysisId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (Number.isInteger(analysisId) && analysisId > 0) void load()
  }, [analysisId, load])

  function handleModeChange(next: ViewMode) {
    setMode(next)
    patcher.schedule({ view_mode: next })
  }

  function handleToggleLocation(warehouseId: number, nextIncluded: boolean) {
    setExcluded((prev) => {
      const set = new Set(prev)
      if (nextIncluded) set.delete(warehouseId)
      else set.add(warehouseId)
      const next = Array.from(set).sort((a, b) => a - b)
      patcher.schedule({ excluded_locations: next })
      return next
    })
  }

  function handleProjectedOrderCountChange(n: number | null) {
    setProjectedOrderCount(n)
    patcher.schedule({ projected_order_count: n })
  }

  function handleProjectedPeriodChange(p: 'month' | 'year') {
    setProjectedPeriod(p)
    patcher.schedule({ projected_period: p })
  }

  if (state.kind === 'loading') return <LoadingSkeleton />
  if (state.kind === 'not_calculated') {
    return (
      <>
        {onNotCalculated?.() ?? (
          <MessageBox title="No results yet" body="Run a calculation first." />
        )}
      </>
    )
  }
  if (state.kind === 'too_large') {
    return (
      <MessageBox
        title="Analysis too large"
        body="This analysis is too large for the current Results View. Contact the developer."
      />
    )
  }
  if (state.kind === 'error') {
    return (
      <MessageBox
        title="Couldn't load results"
        body={
          <>
            {state.message}{' '}
            <button onClick={() => void load()} className="text-blue-600 dark:text-blue-400 hover:underline">
              Retry
            </button>
          </>
        }
      />
    )
  }

  return (
    <ResultsContent
      payload={state.payload}
      mode={mode}
      excluded={excluded}
      projectedOrderCount={projectedOrderCount}
      projectedPeriod={projectedPeriod}
      readonly={false}
      saveError={saveError}
      onModeChange={handleModeChange}
      onToggleLocation={handleToggleLocation}
      onProjectedOrderCountChange={handleProjectedOrderCountChange}
      onProjectedPeriodChange={handleProjectedPeriodChange}
      onSaveErrorRetry={() => {
        setSaveError(null)
        void patcher.flush()
      }}
      headerActions={
        <ShareButton
          analysisId={analysisId}
          initialToken={state.payload.analysis.shareableToken ?? null}
        />
      }
    />
  )
}

function MessageBox({ title, body }: { title: string; body: React.ReactNode }) {
  return (
    <div className="py-12 text-center">
      <h2 className="text-lg font-medium text-gray-800 dark:text-gray-200 mb-1">{title}</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400">{body}</p>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-8 bg-gray-100 dark:bg-gray-800 rounded animate-pulse w-1/2" />
      <div className="h-10 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
      <div className="h-10 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
      <div className="h-10 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
    </div>
  )
}
