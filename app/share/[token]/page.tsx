'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ResultsContent, type ResultsPayload } from '@/components/results/ResultsContent'
import type { ViewMode } from '@/lib/results/derive-table'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'not_found' }
  | { kind: 'not_calculated' }
  | { kind: 'too_large' }
  | { kind: 'loaded'; payload: ResultsPayload }
  | { kind: 'error'; message: string }

export default function SharePage() {
  const params = useParams()
  const token = params?.token as string

  const [state, setState] = useState<LoadState>({ kind: 'loading' })

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!token) { setState({ kind: 'not_found' }); return }
    let cancelled = false

    async function load() {
      try {
        const res = await fetch(`/api/share/${token}`)
        if (cancelled) return
        if (res.status === 404) { setState({ kind: 'not_found' }); return }
        if (res.status === 409) { setState({ kind: 'not_calculated' }); return }
        if (res.status === 413) { setState({ kind: 'too_large' }); return }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          setState({ kind: 'error', message: body?.error?.message ?? 'Failed to load analysis' })
          return
        }
        const payload = (await res.json()) as ResultsPayload
        setState({ kind: 'loaded', payload })
        document.title = `${payload.analysis.name} — Shared Results | 3PL Analyzer`
      } catch (e) {
        if (!cancelled) setState({ kind: 'error', message: e instanceof Error ? e.message : 'Network error' })
      }
    }

    void load()
    return () => { cancelled = true }
  }, [token])

  if (state.kind === 'loading') {
    return (
      <div className="max-w-5xl mx-auto py-8 px-4">
        <div className="space-y-3 animate-pulse">
          <div className="h-7 bg-gray-100 dark:bg-gray-800 rounded w-64 mb-6" />
          <div className="h-8 bg-gray-100 dark:bg-gray-800 rounded w-1/2" />
          <div className="h-10 bg-gray-100 dark:bg-gray-800 rounded" />
          <div className="h-10 bg-gray-100 dark:bg-gray-800 rounded" />
          <div className="h-10 bg-gray-100 dark:bg-gray-800 rounded" />
        </div>
      </div>
    )
  }

  if (state.kind === 'not_found') {
    return (
      <div className="max-w-5xl mx-auto py-20 px-4 text-center">
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-gray-200 mb-2">Link not found</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          This link doesn&apos;t exist or has been revoked. Ask the sender for an updated link.
        </p>
        <Link href="/" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
          ← Go to dashboard
        </Link>
      </div>
    )
  }

  if (state.kind === 'not_calculated') {
    return (
      <div className="max-w-5xl mx-auto py-20 px-4 text-center">
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-gray-200 mb-2">Analysis not ready</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">This analysis hasn&apos;t been calculated yet.</p>
      </div>
    )
  }

  if (state.kind === 'too_large') {
    return (
      <div className="max-w-5xl mx-auto py-20 px-4 text-center">
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-gray-200 mb-2">Analysis too large</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">This analysis is too large to display via share link.</p>
      </div>
    )
  }

  if (state.kind === 'error') {
    return (
      <div className="max-w-5xl mx-auto py-20 px-4 text-center">
        <h1 className="text-2xl font-semibold text-gray-800 dark:text-gray-200 mb-2">Something went wrong</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">{state.message}</p>
      </div>
    )
  }

  const { payload } = state

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      {/* Heading */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{payload.analysis.name}</h1>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Shared analysis — read-only view</p>
      </div>

      <ResultsContent
        payload={payload}
        mode={payload.analysis.viewMode as ViewMode}
        excluded={payload.analysis.excludedLocations}
        projectedOrderCount={payload.analysis.projectedOrderCount}
        projectedPeriod={payload.analysis.projectedPeriod}
        readonly={true}
      />

      {/* Footer */}
      <div className="mt-12 pt-6 border-t border-gray-100 dark:border-gray-800 text-center">
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Generated with{' '}
          <Link href="/" className="hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
            3PL Shipping Analyzer
          </Link>
        </p>
      </div>
    </div>
  )
}
