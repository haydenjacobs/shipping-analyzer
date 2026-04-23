'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'

interface Analysis {
  id: number
  name: string
  status: 'draft' | 'complete'
  createdAt: string
  updatedAt: string
  warehouseCount: number
  orderCount: number
  shareableToken: string | null
}

export default function Dashboard() {
  const [analyses, setAnalyses] = useState<Analysis[]>([])
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/analyses')
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load analyses')
        return r.json()
      })
      .then((data) => setAnalyses(data))
      .catch(() => setError('Failed to load analyses. Refresh to try again.'))
      .finally(() => setLoading(false))
  }, [])

  async function createAnalysis() {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/analyses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      })
      const data = await res.json()
      window.location.href = `/analysis/${data.id}`
    } finally {
      setCreating(false)
    }
  }

  async function deleteAnalysis(id: number) {
    if (!confirm('Delete this analysis? This cannot be undone.')) return
    setDeletingId(id)
    try {
      await fetch(`/api/analyses/${id}`, { method: 'DELETE' })
      setAnalyses((prev) => prev.filter((a) => a.id !== id))
    } finally {
      setDeletingId(null)
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex justify-between items-end mb-8">
        <div>
        </div>
      </div>

      {/* New Analysis */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-7 mb-6">
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">
          New Analysis
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder=""
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void createAnalysis()}
            className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-3 text-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <Button onClick={() => void createAnalysis()} disabled={creating || !newName.trim()} className="px-6 py-3 text-base">
            {creating ? 'Creating…' : 'Create'}
          </Button>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 animate-pulse">
              <div className="h-4 bg-gray-100 dark:bg-gray-700 rounded w-48 mb-2" />
              <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded w-32" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="py-10 text-center">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      ) : analyses.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
          <p className="text-base font-medium text-gray-700 dark:text-gray-300 mb-1">No analyses yet</p>
          <p className="text-sm text-gray-400 dark:text-gray-500">
            Create one above to start comparing 3PL shipping costs.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {analyses.map((a) => (
            <div
              key={a.id}
              className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 transition-colors"
            >
              <Link href={`/analysis/${a.id}`} className="block p-4 group">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate">
                        {a.name}
                      </span>
                      <Badge color={a.status === 'complete' ? 'green' : 'yellow'}>
                        {a.status === 'complete' ? 'Complete' : 'Draft'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 dark:text-gray-500 flex-wrap">
                      <span>Updated {formatDate(a.updatedAt)}</span>
                      {a.orderCount > 0 && (
                        <span>{a.orderCount.toLocaleString()} orders</span>
                      )}
                      {a.warehouseCount > 0 && (
                        <span>
                          {a.warehouseCount} {a.warehouseCount === 1 ? 'warehouse' : 'warehouses'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
              <div className="px-4 pb-3 flex items-center gap-2 border-t border-gray-100 dark:border-gray-700 pt-2">
                <Link
                  href={a.status === 'complete' ? `/analysis/${a.id}/results` : `/analysis/${a.id}`}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Open
                </Link>
                <span className="flex-1" />
                <button
                  onClick={() => void deleteAnalysis(a.id)}
                  disabled={deletingId === a.id}
                  className="text-xs text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 disabled:opacity-50"
                >
                  {deletingId === a.id ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
