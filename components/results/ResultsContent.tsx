'use client'

import { useMemo } from 'react'
import { HeaderStatsBar } from './HeaderStatsBar'
import { SummaryTable } from './SummaryTable'
import { ZoneDistributionChart } from './ZoneDistributionChart'
import { DetailedBreakdown } from './DetailedBreakdown'
import { ExportButtons } from './ExportButtons'
import {
  deriveTableModel,
  type MatrixOrder,
  type MatrixWarehouse,
  type OrderDetail,
  type ViewMode,
} from '@/lib/results/derive-table'
import { deriveZoneDistribution } from '@/lib/results/derive-zone-distribution'
import { derivePerOrderTable } from '@/lib/results/derive-per-order-table'

export interface ResultsPayload {
  analysis: {
    id: number
    name: string
    status: 'draft' | 'complete'
    viewMode: ViewMode
    excludedLocations: number[]
    projectedOrderCount: number | null
    projectedPeriod: 'month' | 'year'
    shareableToken?: string | null
  }
  warehouses: MatrixWarehouse[]
  orders_included_count: number
  orders_excluded_count: number
  matrix: MatrixOrder[]
  orders: OrderDetail[]
}

interface Props {
  payload: ResultsPayload
  /** Current view mode (controlled by parent, may differ from payload default) */
  mode: ViewMode
  /** Current set of excluded warehouse IDs */
  excluded: number[]
  projectedOrderCount: number | null
  projectedPeriod: 'month' | 'year'
  readonly?: boolean
  saveError?: string | null
  onModeChange?: (mode: ViewMode) => void
  onToggleLocation?: (warehouseId: number, next: boolean) => void
  onProjectedOrderCountChange?: (n: number | null) => void
  onProjectedPeriodChange?: (p: 'month' | 'year') => void
  onSaveErrorRetry?: () => void
  /** Extra controls rendered top-right alongside ExportButtons (e.g. ShareButton) */
  headerActions?: React.ReactNode
}

export function ResultsContent({
  payload,
  mode,
  excluded,
  projectedOrderCount,
  projectedPeriod,
  readonly = false,
  saveError,
  onModeChange,
  onToggleLocation,
  onProjectedOrderCountChange,
  onProjectedPeriodChange,
  onSaveErrorRetry,
  headerActions,
}: Props) {
  const model = useMemo(
    () =>
      deriveTableModel({
        warehouses: payload.warehouses,
        matrix: payload.matrix,
        mode,
        excludedWarehouseIds: excluded,
      }),
    [payload, mode, excluded],
  )

  const zoneDistRows = useMemo(
    () =>
      deriveZoneDistribution({
        warehouses: payload.warehouses,
        matrix: payload.matrix,
        mode,
        excludedWarehouseIds: excluded,
        tableRows: model.rows,
      }),
    [payload, model, mode, excluded],
  )

  const perOrderTable = useMemo(
    () =>
      derivePerOrderTable({
        warehouses: payload.warehouses,
        matrix: payload.matrix,
        orders: payload.orders,
        excludedWarehouseIds: excluded,
        tableRows: model.rows,
      }),
    [payload, model, excluded],
  )

  const noop = () => {}

  return (
    <>
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1 min-w-0">
          <HeaderStatsBar
            orderCount={payload.orders_included_count}
            warehouseCount={payload.warehouses.length}
            mode={mode}
            onModeChange={onModeChange ?? noop}
            projectedOrderCount={projectedOrderCount}
            projectedPeriod={projectedPeriod}
            onProjectedOrderCountChange={onProjectedOrderCountChange ?? noop}
            onProjectedPeriodChange={onProjectedPeriodChange ?? noop}
            readonly={readonly}
          />
        </div>
        {!readonly && (
          <div className="flex items-center gap-2 shrink-0 pt-3">
            {perOrderTable && payload.analysis.status === 'complete' && (
              <ExportButtons
                analysisId={payload.analysis.id}
                analysisName={payload.analysis.name}
                orderCount={payload.orders_included_count}
                mode={mode}
                projectedOrderCount={projectedOrderCount}
                projectedPeriod={projectedPeriod}
                excludedWarehouseIds={excluded}
                warehouses={payload.warehouses}
                model={model}
                perOrderTable={perOrderTable}
              />
            )}
            {headerActions}
          </div>
        )}
      </div>

      {saveError && (
        <div className="mb-3 flex items-center justify-between bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 px-3 py-2 rounded-md text-xs">
          <span>{saveError}</span>
          <button
            onClick={onSaveErrorRetry}
            className="text-amber-900 dark:text-amber-200 hover:underline font-medium"
          >
            Retry
          </button>
        </div>
      )}

      <SummaryTable
        model={model}
        onToggleLocation={onToggleLocation ?? noop}
        projectedOrderCount={projectedOrderCount}
        projectedPeriod={projectedPeriod}
        readonly={readonly}
      />

      {zoneDistRows.length > 0 && (
        <div className="mt-6">
          <div className="mb-2">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Zone distribution</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Share of orders by zone for each {mode === 'optimized' ? 'provider' : 'warehouse'}.
            </p>
          </div>
          <ZoneDistributionChart rows={zoneDistRows} />
        </div>
      )}

      {perOrderTable && (
        <div className="mt-6">
          <DetailedBreakdown
            table={perOrderTable}
            includedCount={payload.orders_included_count}
            excludedCount={payload.orders_excluded_count}
            analysisId={payload.analysis.id}
          />
        </div>
      )}
    </>
  )
}
