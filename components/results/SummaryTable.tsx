'use client'

import { useState } from 'react'
import { formatCents } from '@/lib/utils/format'
import type { TableModel, TableRow } from '@/lib/results/derive-table'
import { ProviderRow } from './ProviderRow'

interface Props {
  model: TableModel
  onToggleLocation: (warehouseId: number, next: boolean) => void
  projectedOrderCount: number | null
  projectedPeriod: 'month' | 'year'
  readonly?: boolean
}

function formatProjected(avgCostCents: number, count: number): string {
  const total = (avgCostCents * count) / 100
  return `$${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function SummaryTable({ model, onToggleLocation, projectedOrderCount, projectedPeriod, readonly = false }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const showProjected = projectedOrderCount !== null && projectedOrderCount > 0

  function toggleExpanded(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const colSpan = showProjected ? 4 : 3

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <tr>
            <th className="text-left pl-4 pr-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              3PL / Location
            </th>
            <th className="text-right px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide w-28">
              Avg Zone
            </th>
            <th className="text-right px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide w-32">
              Avg Cost
            </th>
            {showProjected && (
              <th className="text-right px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide w-36">
                {projectedPeriod === 'year' ? 'Projected/Yr' : 'Projected/Mo'}
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700 bg-white dark:bg-gray-900">
          {model.rows.length === 0 && (
            <tr>
              <td colSpan={colSpan} className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">
                No results to display.
              </td>
            </tr>
          )}
          {model.rows.map((row) => (
            <RowRenderer
              key={row.key}
              row={row}
              expanded={expanded.has(row.key)}
              isWinner={row.key === model.winnerKey}
              onToggleExpanded={() => toggleExpanded(row.key)}
              onToggleLocation={onToggleLocation}
              projectedOrderCount={showProjected ? projectedOrderCount : null}
              readonly={readonly}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RowRenderer({
  row,
  expanded,
  isWinner,
  onToggleExpanded,
  onToggleLocation,
  projectedOrderCount,
  readonly,
}: {
  row: TableRow
  expanded: boolean
  isWinner: boolean
  onToggleExpanded: () => void
  onToggleLocation: (warehouseId: number, next: boolean) => void
  projectedOrderCount: number | null
  readonly: boolean
}) {
  if (row.kind === 'single') {
    return (
      <tr className={isWinner ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''}>
        <td className="pl-4 pr-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="w-3" />
            {isWinner && <span aria-label="winner">🥇</span>}
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {row.providerName} — {row.locationLabel}
            </span>
          </div>
        </td>
        <td className="px-3 py-2.5 text-right font-mono text-sm text-gray-700 dark:text-gray-300">
          {row.avgZone.toFixed(1)}
        </td>
        <td className="px-3 py-2.5 text-right font-mono text-sm text-gray-900 dark:text-gray-100">
          {formatCents(row.avgCostCents)}
        </td>
        {projectedOrderCount !== null && (
          <td className="px-3 py-2.5 text-right font-mono text-sm text-gray-700 dark:text-gray-300">
            {formatProjected(row.avgCostCents, projectedOrderCount)}
          </td>
        )}
      </tr>
    )
  }
  return (
    <ProviderRow
      row={row}
      expanded={expanded}
      isWinner={isWinner}
      onToggleExpanded={onToggleExpanded}
      onToggleLocation={onToggleLocation}
      projectedOrderCount={projectedOrderCount}
      readonly={readonly}
    />
  )
}
