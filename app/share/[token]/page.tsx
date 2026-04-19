'use client'
import { useParams } from 'next/navigation'
import { Card } from '@/components/ui/Card'

export default function SharePage() {
  const params = useParams()
  const token = params.token as string

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Shared Analysis</h1>
      <Card>
        <p className="text-sm text-gray-500">
          Shareable analysis view for token: <code className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">{token}</code>
        </p>
        <p className="text-sm text-gray-400 mt-2">
          Shared analysis views are not yet implemented. Please access the analysis directly.
        </p>
      </Card>
    </div>
  )
}
