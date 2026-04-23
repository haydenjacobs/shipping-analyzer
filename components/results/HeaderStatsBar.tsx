'use client'

import { useState, useEffect } from 'react'
import type { ViewMode } from '@/lib/results/derive-table'
import { ModeToggle } from './ModeToggle'

interface Props {
  orderCount: number
  warehouseCount: number
  mode: ViewMode
  onModeChange: (mode: ViewMode) => void
  projectedOrderCount: number | null
  projectedPeriod: 'month' | 'year'
  onProjectedOrderCountChange: (n: number | null) => void
  onProjectedPeriodChange: (p: 'month' | 'year') => void
  readonly?: boolean
}

export function HeaderStatsBar({
  orderCount,
  warehouseCount,
  mode,
  onModeChange,
  projectedOrderCount,
  projectedPeriod,
  onProjectedOrderCountChange,
  onProjectedPeriodChange,
  readonly = false,
}: Props) {
  const [raw, setRaw] = useState(projectedOrderCount !== null ? String(projectedOrderCount) : '')
  const [inputError, setInputError] = useState<string | null>(null)

  // Sync when parent resets (e.g. on load from server)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRaw(projectedOrderCount !== null ? String(projectedOrderCount) : '')
  }, [projectedOrderCount])

  function handleCountChange(value: string) {
    setRaw(value)
    if (value === '') {
      setInputError(null)
      onProjectedOrderCountChange(null)
      return
    }
    const n = Number(value)
    if (!Number.isInteger(n) || n < 0 || value.includes('.')) {
      setInputError('Enter a non-negative whole number')
      return
    }
    setInputError(null)
    onProjectedOrderCountChange(n)
  }

  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-gray-200 dark:border-gray-700 mb-4 flex-wrap">
      <p className="text-sm text-gray-600 dark:text-gray-300 shrink-0">
        Comparing <strong className="text-gray-900 dark:text-gray-100">{orderCount.toLocaleString()}</strong> orders
        across <strong className="text-gray-900 dark:text-gray-100">{warehouseCount}</strong>{' '}
        {warehouseCount === 1 ? 'warehouse' : 'warehouses'}
      </p>

      <div className="flex items-center gap-3 flex-wrap">
        {readonly ? (
          <>
            {projectedOrderCount !== null && projectedOrderCount > 0 && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {projectedOrderCount.toLocaleString()} orders/{projectedPeriod}
              </span>
            )}
            <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-medium">
              {mode === 'optimized' ? 'Optimized' : 'Single-node'}
            </span>
          </>
        ) : (
          <>
            {/* Projected cost input — hidden for now; re-enable by uncommenting
            <div className="flex items-center gap-1.5">
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="Orders per period"
                    value={raw}
                    onChange={(e) => handleCountChange(e.target.value)}
                    aria-label="Orders per period"
                    className={`w-36 px-2 py-1 text-sm border rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 ${
                      inputError
                        ? 'border-red-300 dark:border-red-600 focus:ring-red-400'
                        : 'border-gray-300 dark:border-gray-600 focus:ring-blue-400'
                    }`}
                  />
                  <select
                    value={projectedPeriod}
                    onChange={(e) => onProjectedPeriodChange(e.target.value as 'month' | 'year')}
                    aria-label="Projected period"
                    className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  >
                    <option value="year">/ year</option>
                    <option value="month">/ month</option>
                  </select>
                </div>
                {inputError && (
                  <p className="text-xs text-red-500 dark:text-red-400 mt-0.5">{inputError}</p>
                )}
              </div>
            </div>
            */}

            <ModeToggle mode={mode} onChange={onModeChange} />
          </>
        )}
      </div>
    </div>
  )
}
