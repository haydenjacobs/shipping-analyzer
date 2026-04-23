'use client'

import type { ViewMode } from '@/lib/results/derive-table'

interface Props {
  mode: ViewMode
  onChange: (mode: ViewMode) => void
}

export function ModeToggle({ mode, onChange }: Props) {
  const options: Array<{ value: ViewMode; label: string }> = [
    { value: 'optimized', label: 'Optimized' },
    { value: 'single_node', label: 'Single-node' },
  ]
  return (
    <div className="inline-flex rounded-full border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 p-0.5" role="tablist">
      {options.map((o) => {
        const active = mode === o.value
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`px-3.5 py-1 text-xs font-medium rounded-full transition-colors ${
              active
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
