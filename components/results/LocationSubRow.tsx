'use client'

import { formatCents } from '@/lib/utils/format'

interface Props {
  warehouseId: number
  locationLabel: string
  included: boolean
  avgZone: number
  avgCostCents: number
  onToggle: (warehouseId: number, next: boolean) => void
  projectedOrderCount: number | null
  readonly?: boolean
}

function formatProjected(avgCostCents: number, count: number): string {
  const total = (avgCostCents * count) / 100
  return `$${total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function LocationSubRow({
  warehouseId,
  locationLabel,
  included,
  avgZone,
  avgCostCents,
  onToggle,
  projectedOrderCount,
  readonly = false,
}: Props) {
  return (
    <tr className={included ? '' : 'text-gray-400 dark:text-gray-600'}>
      <td className="pl-10 pr-3 py-2">
        {readonly ? (
          <span className={included ? 'text-sm text-gray-700 dark:text-gray-300' : 'text-sm text-gray-400 dark:text-gray-600 line-through'}>
            {locationLabel}
          </span>
        ) : (
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={included}
              onChange={(e) => onToggle(warehouseId, e.target.checked)}
              className="h-3.5 w-3.5 rounded border-gray-300 dark:border-gray-600"
            />
            <span className={included ? 'text-sm text-gray-700 dark:text-gray-300' : 'text-sm line-through'}>
              {locationLabel}
            </span>
          </label>
        )}
      </td>
      <td className={`px-3 py-2 text-right font-mono text-sm ${included ? 'text-gray-600 dark:text-gray-400' : ''}`}>
        {avgZone.toFixed(1)}
      </td>
      <td className={`px-3 py-2 text-right font-mono text-sm ${included ? 'text-gray-700 dark:text-gray-300' : ''}`}>
        {formatCents(avgCostCents)}
      </td>
      {projectedOrderCount !== null && (
        <td className={`px-3 py-2 text-right font-mono text-sm ${included ? 'text-gray-600 dark:text-gray-400' : ''}`}>
          {formatProjected(avgCostCents, projectedOrderCount)}
        </td>
      )}
    </tr>
  )
}
