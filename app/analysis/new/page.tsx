'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'

export default function NewAnalysisPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    if (!name.trim()) return
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/analyses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error?.message ?? 'Failed to create analysis')
        return
      }
      router.push(`/analysis/${data.id}`)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-3 flex items-center gap-4">
        <Link href="/" className="text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">
          ← Dashboard
        </Link>
        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">New Analysis</span>
      </div>
      <div className="max-w-md mx-auto px-6 py-12">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-6">Create Analysis</h1>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Analysis Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder='e.g., "Client X — Q1 2025"'
              className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex gap-2">
            <Button onClick={handleCreate} disabled={creating || !name.trim()}>
              {creating ? 'Creating…' : 'Create Analysis'}
            </Button>
            <Button variant="secondary" onClick={() => router.push('/')}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
