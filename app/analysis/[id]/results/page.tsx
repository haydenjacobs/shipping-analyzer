'use client'

import { useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ResultsView } from '@/components/results/ResultsView'

export default function ResultsPage() {
  const params = useParams()
  const analysisId = Number(params?.id)

  useEffect(() => {
    document.title = 'Results | 3PL Analyzer'
  }, [])

  if (!Number.isInteger(analysisId) || analysisId <= 0) {
    return (
      <div className="max-w-5xl mx-auto py-8 px-4">
        <p className="text-sm text-red-600 dark:text-red-400">Invalid analysis id</p>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      <div className="mb-4">
        <Link
          href={`/analysis/${analysisId}`}
          className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        >
          ← Back to Workspace
        </Link>
      </div>
      <ResultsView
        analysisId={analysisId}
        onNotCalculated={() => (
          <div className="py-12 text-center">
            <h2 className="text-lg font-medium text-gray-800 dark:text-gray-200 mb-1">No results yet</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Run a calculation first.{' '}
              <Link
                href={`/analysis/${analysisId}`}
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                Go to Calculate
              </Link>
              .
            </p>
          </div>
        )}
      />
    </div>
  )
}
