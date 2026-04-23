'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import type { AnalysisData } from './types'
import { groupByProvider } from './types'
import { downloadExcludedOrdersCsv } from '@/lib/results/excluded-orders-csv'

interface Props {
  analysis: AnalysisData
  onCalculated: () => void
  onGoToResults: () => void
}

interface CalcResult {
  includedCount: number
  excludedCount: number
}

interface ExcludedOrder {
  orderId: number
  orderNumber: string
  destZip: string
  actualWeightLbs: number
  reason: string
  details: string | null
}

export function CalculateTab({ analysis, onCalculated, onGoToResults }: Props) {
  const [calculating, setCalculating] = useState(false)
  const [calcResult, setCalcResult] = useState<CalcResult | null>(null)
  const [calcError, setCalcError] = useState<string | null>(null)
  const [excludedOrders, setExcludedOrders] = useState<ExcludedOrder[] | null>(null)
  const [loadingExcluded, setLoadingExcluded] = useState(false)

  const providers = groupByProvider(analysis.warehouses)
  const hasOrders = analysis.orderCount > 0
  const hasProviders = analysis.warehouses.length > 0
  const allHaveRateCards = providers.every((p) => p.rateCard !== null)
  const canCalculate = hasOrders && hasProviders && allHaveRateCards

  async function runCalculation() {
    setCalculating(true)
    setCalcError(null)
    setCalcResult(null)
    try {
      const res = await fetch(`/api/analyses/${analysis.id}/calculate`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        const msg = data?.error?.message ?? 'Calculation failed'
        const code = data?.error?.code ?? ''
        setCalcError(code === 'ENGINE_ERROR' ? `Engine error: ${msg}` : msg)
        return
      }
      setCalcResult({ includedCount: data.included_count, excludedCount: data.excluded_count })
      onCalculated()
    } catch (e) {
      setCalcError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setCalculating(false)
    }
  }

  async function downloadExcluded() {
    if (excludedOrders !== null) {
      setExcludedOrders(null)
      return
    }
    setLoadingExcluded(true)
    try {
      const res = await fetch(`/api/analyses/${analysis.id}/excluded-orders`)
      const data = await res.json()
      setExcludedOrders(data.rows ?? [])
    } finally {
      setLoadingExcluded(false)
    }
  }

  function downloadExcludedCsv(rows: ExcludedOrder[]) {
    downloadExcludedOrdersCsv(rows)
  }

  const CheckItem = ({
    ok,
    label,
    detail,
  }: {
    ok: boolean
    label: string
    detail?: string
  }) => (
    <div className="flex items-start gap-3">
      <span
        className={`mt-0.5 text-sm font-bold w-4 shrink-0 ${ok ? 'text-green-600 dark:text-green-400' : 'text-gray-300 dark:text-gray-600'}`}
      >
        {ok ? '✓' : '○'}
      </span>
      <div>
        <span className={`text-sm ${ok ? 'text-gray-800 dark:text-gray-200' : 'text-gray-500 dark:text-gray-400'}`}>{label}</span>
        {detail && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{detail}</p>}
      </div>
    </div>
  )

  const isComplete = analysis.status === 'complete'

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Run Calculation</h2>
      </div>

      {/* Prerequisites checklist */}
      <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
        <CheckItem
          ok={hasOrders}
          label={hasOrders ? `${analysis.orderCount.toLocaleString()} orders` : 'Upload orders'}
          detail={!hasOrders ? 'Go to the Orders tab to upload.' : undefined}
        />
        <CheckItem
          ok={hasProviders}
          label={hasProviders ? `${providers.length} provider${providers.length !== 1 ? 's' : ''}` : 'Add at least one provider'}
          detail={!hasProviders ? 'Go to the Providers tab to add a provider.' : undefined}
        />
      </div>

      {/* Run button */}
      <Button onClick={runCalculation} disabled={!canCalculate || calculating}>
        {calculating ? 'Calculating…' : isComplete ? 'Re-run Calculation' : 'Run Calculation'}
      </Button>

      {calculating && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Calculating… this can take a few seconds for larger analyses.
        </p>
      )}

      {/* Error */}
      {calcError && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-sm font-semibold text-red-700 dark:text-red-300 mb-1">Calculation failed</p>
          <p className="text-sm text-red-600 dark:text-red-400 font-mono">{calcError}</p>
        </div>
      )}

      {/* Success */}
      {calcResult && (
        <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg p-4 space-y-3">
          <p className="text-sm font-semibold text-green-800 dark:text-green-300">Calculation complete</p>
          <p className="text-sm text-green-700 dark:text-green-400">
            <strong>{calcResult.includedCount.toLocaleString()}</strong> orders included
            {calcResult.excludedCount > 0 && (
              <>
                ,{' '}
                <strong className="text-amber-700 dark:text-amber-400">{calcResult.excludedCount.toLocaleString()}</strong>{' '}
                excluded
              </>
            )}
          </p>
          <div className="flex gap-3 items-center flex-wrap">
            <Button size="sm" onClick={onGoToResults}>
              View Results
            </Button>
            {calcResult.excludedCount > 0 && (
              <button
                onClick={downloadExcluded}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                disabled={loadingExcluded}
              >
                {loadingExcluded
                  ? 'Loading…'
                  : excludedOrders !== null
                    ? 'Hide excluded orders'
                    : 'View excluded orders'}
              </button>
            )}
          </div>

          {excludedOrders !== null && excludedOrders.length > 0 && (
            <div className="space-y-2">
              <div className="max-h-48 overflow-y-auto border border-green-200 dark:border-green-800 rounded bg-white dark:bg-gray-900">
                <table className="min-w-full text-xs">
                  <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="text-left px-3 py-1.5 font-medium text-gray-600 dark:text-gray-400">Order #</th>
                      <th className="text-left px-3 py-1.5 font-medium text-gray-600 dark:text-gray-400">ZIP</th>
                      <th className="text-right px-3 py-1.5 font-medium text-gray-600 dark:text-gray-400">Weight</th>
                      <th className="text-left px-3 py-1.5 font-medium text-gray-600 dark:text-gray-400">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {excludedOrders.map((r) => (
                      <tr key={r.orderId} className="border-t border-gray-100 dark:border-gray-800">
                        <td className="px-3 py-1 font-mono text-gray-900 dark:text-gray-100">{r.orderNumber}</td>
                        <td className="px-3 py-1 font-mono text-gray-900 dark:text-gray-100">{r.destZip}</td>
                        <td className="px-3 py-1 text-right font-mono text-gray-700 dark:text-gray-300">
                          {r.actualWeightLbs.toFixed(3)} lbs
                        </td>
                        <td className="px-3 py-1 text-red-600 dark:text-red-400">{r.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                onClick={() => downloadExcludedCsv(excludedOrders)}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                Download as CSV
              </button>
            </div>
          )}
        </div>
      )}

      {/* Already-complete state (no fresh calc result yet) */}
      {isComplete && !calcResult && !calcError && (
        <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 space-y-2">
          <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">Previously calculated</p>
          <p className="text-sm text-blue-700 dark:text-blue-400">
            This analysis has results from a previous run. Re-run to update.
          </p>
          <Button size="sm" onClick={onGoToResults}>
            View Results
          </Button>
        </div>
      )}
    </div>
  )
}
