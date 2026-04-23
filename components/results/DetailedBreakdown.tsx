'use client'

import { useState } from 'react'
import { formatCents } from '@/lib/utils/format'
import type { PerOrderTableResult, PerOrderRow, ColKind } from '@/lib/results/derive-per-order-table'
import { downloadExcludedOrdersCsv } from '@/lib/results/excluded-orders-csv'
import type { ExcludedOrderRow } from '@/lib/results/excluded-orders-csv'

const PAGE_SIZE = 500

interface Props {
  table: PerOrderTableResult
  includedCount: number
  excludedCount: number
  analysisId: number
}

export function DetailedBreakdown({ table, includedCount, excludedCount, analysisId }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [visible, setVisible] = useState(PAGE_SIZE)
  const [loadingExcluded, setLoadingExcluded] = useState(false)

  const showAll = includedCount < PAGE_SIZE
  const displayRows = showAll ? table.rows : table.rows.slice(0, visible)
  const hasMore = !showAll && visible < table.rows.length

  async function handleDownloadExcluded() {
    setLoadingExcluded(true)
    try {
      const res = await fetch(`/api/analyses/${analysisId}/excluded-orders`)
      const data = await res.json()
      const rows: ExcludedOrderRow[] = (data.rows ?? []).map((r: {
        orderId: number
        orderNumber: string
        destZip: string
        actualWeightLbs: number
        reason: string
        details: string | null
      }) => ({
        orderId: r.orderId,
        orderNumber: r.orderNumber,
        destZip: r.destZip,
        actualWeightLbs: r.actualWeightLbs,
        reason: r.reason,
        details: r.details,
      }))
      downloadExcludedOrdersCsv(rows)
    } finally {
      setLoadingExcluded(false)
    }
  }

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      {/* Section header — always visible, click to expand */}
      <button
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2">
          <span className="text-gray-400 dark:text-gray-500 text-sm">{expanded ? '▾' : '▸'}</span>
          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
            Detailed breakdown — {includedCount.toLocaleString()} orders
          </span>
        </div>
        {excludedCount > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              void handleDownloadExcluded()
            }}
            disabled={loadingExcluded}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50 shrink-0"
          >
            {loadingExcluded
              ? 'Downloading…'
              : `Download excluded orders (${excludedCount.toLocaleString()})`}
          </button>
        )}
      </button>

      {expanded && (
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse" style={{ minWidth: 'max-content' }}>
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                {table.columns.map((col, i) => (
                  <th
                    key={col.key}
                    className={`px-3 py-2 font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap border-b border-gray-200 dark:border-gray-700 ${
                      i === 0
                        ? 'sticky left-0 z-10 bg-gray-50 dark:bg-gray-800 text-left'
                        : colAlign(col.kind)
                    }`}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayRows.map((row) => (
                <BreakdownRow key={row.orderId} row={row} columns={table.columns} />
              ))}
            </tbody>
          </table>

          {/* Pagination footer */}
          {hasMore && (
            <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800 flex items-center gap-3">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Showing {visible.toLocaleString()} of {table.rows.length.toLocaleString()} orders
              </span>
              <button
                onClick={() => setVisible((v) => Math.min(v + PAGE_SIZE, table.rows.length))}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                Load more
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function colAlign(kind: ColKind): string {
  if (kind === 'warehouse-zone' || kind === 'opt-zone') return 'text-center'
  if (kind === 'warehouse-cost' || kind === 'opt-cost') return 'text-right'
  return 'text-left'
}

function BreakdownRow({
  row,
  columns,
}: {
  row: PerOrderRow
  columns: PerOrderTableResult['columns']
}) {
  return (
    <tr className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50/50 dark:hover:bg-gray-800/50">
      {columns.map((col, i) => {
        const isSticky = i === 0
        const baseClass = `px-3 py-1.5 whitespace-nowrap ${
          isSticky ? 'sticky left-0 z-10 bg-white dark:bg-gray-900 font-mono' : ''
        }`

        switch (col.kind) {
          case 'order-number':
            return (
              <td key={col.key} className={`${baseClass} font-mono text-gray-800 dark:text-gray-200`}>
                {row.orderNumber}
              </td>
            )
          case 'actual-weight':
            return (
              <td key={col.key} className={`${baseClass} text-right font-mono text-gray-700 dark:text-gray-300`}>
                {row.actualWeightLbs.toFixed(3)}
              </td>
            )
          case 'dims':
            return (
              <td key={col.key} className={`${baseClass} text-gray-600 dark:text-gray-400`}>
                {row.dims ?? '—'}
              </td>
            )
          case 'dest-zip':
            return (
              <td key={col.key} className={`${baseClass} font-mono text-gray-700 dark:text-gray-300`}>
                {row.destZip}
              </td>
            )
          case 'state':
            return (
              <td key={col.key} className={`${baseClass} text-gray-600 dark:text-gray-400`}>
                {row.state ?? '—'}
              </td>
            )
          case 'billable-weight':
            return (
              <td key={col.key} className={`${baseClass} text-right font-mono text-gray-700 dark:text-gray-300`}>
                {row.billableWeightValue !== null ? row.billableWeightValue : '—'}
              </td>
            )
          case 'billable-unit':
            return (
              <td key={col.key} className={`${baseClass} text-gray-600 dark:text-gray-400`}>
                {row.billableWeightUnit ?? '—'}
              </td>
            )
          case 'warehouse-zone': {
            const wid = col.warehouseId!
            const zone = row.warehouseZones[wid]
            return (
              <td key={col.key} className={`${baseClass} text-center font-mono text-gray-700 dark:text-gray-300`}>
                {zone !== undefined ? zone : '—'}
              </td>
            )
          }
          case 'warehouse-cost': {
            const wid = col.warehouseId!
            const cost = row.warehouseCosts[wid]
            return (
              <td key={col.key} className={`${baseClass} text-right font-mono text-gray-700 dark:text-gray-300`}>
                {cost !== undefined ? formatCents(cost) : '—'}
              </td>
            )
          }
          case 'opt-zone': {
            const pn = col.providerName!
            const zone = row.optZones[pn]
            return (
              <td key={col.key} className={`${baseClass} text-center font-mono text-blue-700 dark:text-blue-400`}>
                {zone !== undefined ? zone : '—'}
              </td>
            )
          }
          case 'opt-cost': {
            const pn = col.providerName!
            const cost = row.optCosts[pn]
            return (
              <td key={col.key} className={`${baseClass} text-right font-mono text-blue-700 dark:text-blue-400 font-medium`}>
                {cost !== undefined ? formatCents(cost) : '—'}
              </td>
            )
          }
          case 'opt-winner': {
            const pn = col.providerName!
            const winner = row.optWinners[pn]
            return (
              <td key={col.key} className={`${baseClass} text-gray-600 dark:text-gray-400`}>
                {winner ?? '—'}
              </td>
            )
          }
          default:
            return <td key={col.key} className={baseClass}>—</td>
        }
      })}
    </tr>
  )
}
