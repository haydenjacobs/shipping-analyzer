'use client'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'

interface Analysis {
  id: number
  name: string
  status: 'draft' | 'complete'
  createdAt: string
}

export default function Dashboard() {
  const [analyses, setAnalyses] = useState<Analysis[]>([])
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/analyses')
      .then(r => r.json())
      .then(data => { setAnalyses(data); setLoading(false) })
  }, [])

  async function createAnalysis() {
    if (!newName.trim()) return
    setCreating(true)
    const res = await fetch('/api/analyses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim() }),
    })
    const data = await res.json()
    setCreating(false)
    setNewName('')
    window.location.href = `/analysis/${data.id}`
  }

  async function deleteAnalysis(id: number) {
    if (!confirm('Delete this analysis?')) return
    await fetch(`/api/analyses/${id}`, { method: 'DELETE' })
    setAnalyses(prev => prev.filter(a => a.id !== id))
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analyses</h1>
          <p className="text-sm text-gray-500 mt-1">Compare 3PL shipping costs across warehouses</p>
        </div>
      </div>

      {/* New Analysis */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6 flex gap-3">
        <input
          type="text"
          placeholder='Analysis name (e.g., "Client X — Q1 2025")'
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && createAnalysis()}
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <Button onClick={createAnalysis} disabled={creating || !newName.trim()}>
          {creating ? 'Creating...' : 'New Analysis'}
        </Button>
      </div>

      {/* List */}
      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : analyses.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">No analyses yet</p>
          <p className="text-sm mt-1">Create one above to get started</p>
        </div>
      ) : (
        <div className="space-y-2">
          {analyses.map(a => (
            <div key={a.id} className="bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-between hover:border-blue-300 transition-colors">
              <div className="flex items-center gap-3">
                <div>
                  <a href={`/analysis/${a.id}`} className="font-medium text-gray-900 hover:text-blue-600">
                    {a.name}
                  </a>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(a.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                <Badge color={a.status === 'complete' ? 'green' : 'yellow'}>
                  {a.status}
                </Badge>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => window.location.href = `/analysis/${a.id}`}>
                  Open
                </Button>
                <Button variant="danger" size="sm" onClick={() => deleteAnalysis(a.id)}>
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
