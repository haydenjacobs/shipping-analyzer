'use client'

import type { TableRow } from '@/lib/results/derive-table'
import { formatCents } from '@/lib/utils/format'
import { NodeUtilizationStrip } from './NodeUtilizationStrip'
import { LocationSubRow } from './LocationSubRow'

function formatProjected(avgCostCents: number, count: number): string {
  const total = (avgCostCents * count) / 100
  return `$${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

interface Props {
  row: Extract<TableRow, { kind: 'provider' }>
  expanded: boolean
  isWinner: boolean
  onToggleExpanded: () => void
  onToggleLocation: (warehouseId: number, next: boolean) => void
  projectedOrderCount: number | null
  readonly?: boolean
}

export function ProviderRow({
  row,
  expanded,
  isWinner,
  onToggleExpanded,
  onToggleLocation,
  projectedOrderCount,
  readonly = false,
}: Props) {
  const showProjected = projectedOrderCount !== null && projectedOrderCount > 0
  const caret = expanded ? '▾' : '▸'
  const label = row.allExcluded
    ? `${row.providerName} (0 of ${row.totalLocations} — all locations excluded)`
    : `${row.providerName} (optimized · ${row.includedWarehouseIds.length} of ${row.totalLocations})`

  const includedUtilization = row.locations
    .filter((l) => l.included)
    .map((l) => ({
      locationLabel: l.locationLabel,
      percent: row.nodeUtilization[l.warehouseId] ?? 0,
    }))

  const colSpan = showProjected ? 4 : 3

  return (
    <>
      <tr
        className={`cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 ${isWinner ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''}`}
        onClick={onToggleExpanded}
      >
        <td className="pl-4 pr-3 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-gray-400 dark:text-gray-500 w-3 text-center">{caret}</span>
            {isWinner && <span aria-label="winner">🥇</span>}
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{label}</span>
          </div>
        </td>
        <td className="px-3 py-2.5 text-right font-mono text-sm text-gray-700 dark:text-gray-300">
          {row.allExcluded ? '—' : row.avgZone.toFixed(1)}
        </td>
        <td className="px-3 py-2.5 text-right font-mono text-sm text-gray-900 dark:text-gray-100">
          {row.allExcluded ? '—' : formatCents(row.avgCostCents)}
        </td>
        {showProjected && (
          <td className="px-3 py-2.5 text-right font-mono text-sm text-gray-700 dark:text-gray-300">
            {row.allExcluded ? '—' : formatProjected(row.avgCostCents, projectedOrderCount)}
          </td>
        )}
      </tr>
      {expanded && (
        <>
          {!row.allExcluded && (
            <tr>
              <td colSpan={colSpan} className="p-0">
                <NodeUtilizationStrip entries={includedUtilization} />
              </td>
            </tr>
          )}
          {row.locations.map((loc) => (
            <LocationSubRow
              key={loc.warehouseId}
              warehouseId={loc.warehouseId}
              locationLabel={loc.locationLabel}
              included={loc.included}
              avgZone={loc.avgZone}
              avgCostCents={loc.avgCostCents}
              onToggle={onToggleLocation}
              projectedOrderCount={showProjected ? projectedOrderCount : null}
              readonly={readonly}
            />
          ))}
        </>
      )}
    </>
  )
}
