'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { WorkspaceSidebar } from '@/components/analysis/WorkspaceSidebar'
import { OrdersTab } from '@/components/analysis/OrdersTab'
import { ProvidersTab } from '@/components/analysis/ProvidersTab'
import { CalculateTab } from '@/components/analysis/CalculateTab'
import { ResultsTab } from '@/components/analysis/ResultsTab'
import type { AnalysisData, WorkspaceTab } from '@/components/analysis/types'

export default function WorkspacePage() {
  const params = useParams()
  const analysisId = Number(params?.id)

  const [tab, setTab] = useState<WorkspaceTab>('orders')
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [savingName, setSavingName] = useState(false)

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/analyses/${analysisId}`)
    if (!res.ok) {
      setLoadError('Failed to load analysis')
      return
    }
    const data: AnalysisData = await res.json()
    setAnalysis(data)
    setNameInput(data.name)
    document.title = `${data.name} | 3PL Analyzer`
  }, [analysisId])

  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [refresh])

  async function saveName() {
    if (!nameInput.trim() || !analysis) return
    setSavingName(true)
    try {
      const res = await fetch(`/api/analyses/${analysisId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nameInput.trim() }),
      })
      if (res.ok) {
        await refresh()
        setEditingName(false)
      }
    } finally {
      setSavingName(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-gray-400 dark:text-gray-500">
        Loading…
      </div>
    )
  }

  if (loadError || !analysis) {
    return (
      <div className="py-10 text-center">
        <p className="text-sm text-red-600 dark:text-red-400">{loadError ?? 'Analysis not found'}</p>
        <Link href="/" className="text-sm text-blue-600 dark:text-blue-400 hover:underline mt-2 inline-block">
          ← Back to Dashboard
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      {/* Top bar */}
      <div className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-6 py-3 flex items-center gap-4">
        <Link href="/" className="text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 shrink-0">
          ←
        </Link>
        <div className="flex-1 min-w-0">
          {editingName ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveName()
                  if (e.key === 'Escape') setEditingName(false)
                }}
                autoFocus
                className="border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 text-sm font-medium bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={saveName}
                disabled={savingName}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                {savingName ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={() => {
                  setEditingName(false)
                  setNameInput(analysis.name)
                }}
                className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setEditingName(true)}
              className="text-sm font-medium text-gray-800 dark:text-gray-200 hover:text-gray-900 dark:hover:text-gray-100 truncate max-w-full text-left"
              title="Click to rename"
            >
              {analysis.name}
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex px-6 py-6 gap-8 max-w-6xl">
        <WorkspaceSidebar analysis={analysis} activeTab={tab} onTabChange={setTab} />

        <main className="flex-1 min-w-0">
          {tab === 'orders' && (
            <OrdersTab
              analysisId={analysis.id}
              orderCount={analysis.orderCount}
              onOrdersChanged={refresh}
            />
          )}
          {tab === 'providers' && (
            <ProvidersTab analysis={analysis} onChanged={refresh} />
          )}
          {tab === 'calculate' && (
            <CalculateTab
              analysis={analysis}
              onCalculated={refresh}
              onGoToResults={() => setTab('results')}
            />
          )}
          {tab === 'results' && analysis.status === 'complete' && (
            <ResultsTab analysis={analysis} />
          )}
          {tab === 'results' && analysis.status !== 'complete' && (
            <div className="py-12 text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Run a calculation first to see results.
              </p>
              <button
                onClick={() => setTab('calculate')}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline mt-2"
              >
                Go to Calculate
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
