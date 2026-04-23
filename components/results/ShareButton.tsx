'use client'

import { useState } from 'react'

interface Props {
  analysisId: number
  initialToken: string | null
}

type State = 'idle' | 'loading' | 'copied' | 'revoking'

export function ShareButton({ analysisId, initialToken }: Props) {
  const [token, setToken] = useState<string | null>(initialToken)
  const [state, setState] = useState<State>('idle')

  async function generate() {
    setState('loading')
    try {
      const res = await fetch(`/api/analyses/${analysisId}/share`, { method: 'POST' })
      if (!res.ok) { setState('idle'); return }
      const data = (await res.json()) as { token: string; url: string }
      setToken(data.token)
      const url = `${window.location.origin}/share/${data.token}`
      await navigator.clipboard.writeText(url).catch(() => {})
      setState('copied')
      setTimeout(() => setState('idle'), 3000)
    } catch {
      setState('idle')
    }
  }

  async function revoke() {
    setState('revoking')
    try {
      await fetch(`/api/analyses/${analysisId}/share`, { method: 'DELETE' })
      setToken(null)
      setState('idle')
    } catch {
      setState('idle')
    }
  }

  if (token) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={generate}
          disabled={state === 'loading' || state === 'revoking'}
          className="text-xs px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors disabled:opacity-50"
          title="Copy new share link (revokes current link)"
        >
          {state === 'copied' ? 'Link copied!' : state === 'loading' ? 'Generating…' : 'Share'}
        </button>
        <button
          onClick={revoke}
          disabled={state === 'loading' || state === 'revoking'}
          className="text-xs px-3 py-1.5 rounded border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
        >
          {state === 'revoking' ? 'Revoking…' : 'Revoke link'}
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={generate}
      disabled={state === 'loading'}
      className="text-xs px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-blue-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors disabled:opacity-50"
    >
      {state === 'copied' ? 'Link copied!' : state === 'loading' ? 'Generating…' : 'Share'}
    </button>
  )
}
