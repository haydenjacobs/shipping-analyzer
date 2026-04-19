'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'

export default function NewAnalysisPage() {
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
        setError(data.error ?? 'Failed to create analysis')
        return
      }
      window.location.href = `/analysis/${data.id}`
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="max-w-lg">
      <div className="mb-6">
        <a href="/" className="text-sm text-gray-500 hover:text-gray-700">← Back to Dashboard</a>
      </div>
      <Card title="New Analysis">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Analysis Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder='e.g., "Client X — Q1 2025"'
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <Button onClick={handleCreate} disabled={creating || !name.trim()}>
              {creating ? 'Creating...' : 'Create Analysis'}
            </Button>
            <Button variant="secondary" onClick={() => window.location.href = '/'}>Cancel</Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
