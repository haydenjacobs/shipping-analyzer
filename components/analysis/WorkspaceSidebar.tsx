'use client'

import type { AnalysisData, WorkspaceTab } from './types'
import { groupByProvider, getCalculateStatus } from './types'

interface Props {
  analysis: AnalysisData | null
  activeTab: WorkspaceTab
  onTabChange: (tab: WorkspaceTab) => void
}

interface TabMeta {
  id: WorkspaceTab
  label: string
  statusLine: (analysis: AnalysisData | null) => string
  disabled?: (analysis: AnalysisData | null) => boolean
}

const TABS: TabMeta[] = [
  {
    id: 'orders',
    label: 'Orders',
    statusLine: (a) =>
      !a || a.orderCount === 0 ? 'Not uploaded' : `${a.orderCount.toLocaleString()} orders`,
  },
  {
    id: 'providers',
    label: 'Providers',
    statusLine: (a) => {
      if (!a || a.warehouses.length === 0) return 'None added'
      const providers = groupByProvider(a.warehouses)
      return `${providers.length} provider${providers.length !== 1 ? 's' : ''} / ${a.warehouses.length} location${a.warehouses.length !== 1 ? 's' : ''}`
    },
  },
  {
    id: 'calculate',
    label: 'Calculate',
    statusLine: (a) => {
      const status = getCalculateStatus(a)
      return {
        needs_inputs: 'Needs inputs',
        ready: 'Ready',
        complete: 'Complete',
        error: 'Error',
      }[status]
    },
  },
  {
    id: 'results',
    label: 'Results',
    statusLine: (a) => (a?.status === 'complete' ? 'Available' : 'Run calculate first'),
    disabled: (a) => a?.status !== 'complete',
  },
]

export function WorkspaceSidebar({ analysis, activeTab, onTabChange }: Props) {
  const resultsReady = analysis?.status === 'complete'

  return (
    <nav className="w-52 shrink-0 flex flex-col gap-1 pt-2">
      {TABS.map((tab) => {
        const isActive = tab.id === activeTab
        const isDisabled = tab.disabled?.(analysis) ?? false
        const isResultsReady = tab.id === 'results' && resultsReady

        return (
          <button
            key={tab.id}
            onClick={() => !isDisabled && onTabChange(tab.id)}
            disabled={isDisabled}
            title={isDisabled ? 'Run calculate first to view results' : undefined}
            className={[
              'w-full text-left px-3 py-2.5 rounded-md transition-colors',
              isActive
                ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                : isDisabled
                  ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                  : isResultsReady
                    ? 'text-gray-700 dark:text-gray-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800',
            ].join(' ')}
          >
            <div className="flex items-center justify-between gap-2">
              <span className={`text-sm font-medium ${isActive ? 'text-blue-700 dark:text-blue-300' : isResultsReady ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
                {tab.label}
              </span>
              {isResultsReady && !isActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              )}
            </div>
            {isResultsReady && !isActive && (
              <p className="text-xs text-emerald-600 dark:text-emerald-500 mt-0.5">Ready to view</p>
            )}
          </button>
        )
      })}
    </nav>
  )
}
