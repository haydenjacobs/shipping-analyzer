'use client'

import { useState } from 'react'
import { buildSummaryExport } from '@/lib/export/summary-export'
import { buildPerOrderExport } from '@/lib/export/per-order-export'
import {
  buildPerOrderCsv,
  buildSummaryCsv,
  triggerCsvDownload,
} from '@/lib/export/csv-writer'
import { buildWorkbook, triggerXlsxDownload } from '@/lib/export/xlsx-writer'
import { slugifyAnalysisName } from '@/lib/export/filename'
import type { TableModel, MatrixWarehouse, ViewMode } from '@/lib/results/derive-table'
import type { PerOrderTableResult } from '@/lib/results/derive-per-order-table'

interface Props {
  analysisId: number
  analysisName: string
  orderCount: number
  mode: ViewMode
  projectedOrderCount: number | null
  projectedPeriod: 'month' | 'year'
  excludedWarehouseIds: number[]
  warehouses: MatrixWarehouse[]
  model: TableModel
  perOrderTable: PerOrderTableResult
  disabled?: boolean
}

type Busy = null | 'csv' | 'xlsx'

export function ExportButtons(props: Props) {
  const [busy, setBusy] = useState<Busy>(null)
  const [error, setError] = useState<string | null>(null)

  async function runExport(kind: 'csv' | 'xlsx') {
    setBusy(kind)
    setError(null)
    try {
      // Defer to next tick so the "Generating…" label paints before the main-thread
      // build work begins — keeps the UI honest on larger analyses.
      await new Promise((resolve) => setTimeout(resolve, 0))

      const summary = buildSummaryExport({
        analysisName: props.analysisName,
        orderCount: props.orderCount,
        mode: props.mode,
        projectedOrderCount: props.projectedOrderCount,
        projectedPeriod: props.projectedPeriod,
        excludedWarehouseIds: props.excludedWarehouseIds,
        model: props.model,
        warehouses: props.warehouses,
      })
      const perOrder = buildPerOrderExport(props.perOrderTable)
      const slug = slugifyAnalysisName(props.analysisName, props.analysisId)

      if (kind === 'csv') {
        triggerCsvDownload(`${slug}-summary.csv`, buildSummaryCsv(summary))
        triggerCsvDownload(`${slug}-orders.csv`, buildPerOrderCsv(perOrder))
      } else {
        triggerXlsxDownload(`${slug}.xlsx`, buildWorkbook({ summary, perOrder }))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={props.disabled || busy !== null}
        onClick={() => void runExport('csv')}
        className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {busy === 'csv' ? 'Generating…' : 'Export CSV'}
      </button>
      <button
        type="button"
        disabled={props.disabled || busy !== null}
        onClick={() => void runExport('xlsx')}
        className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {busy === 'xlsx' ? 'Generating…' : 'Export Excel'}
      </button>
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </div>
  )
}
