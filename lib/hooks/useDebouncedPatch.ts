'use client'

import { useCallback, useEffect, useRef } from 'react'

export interface DebouncedPatcher<T> {
  /** Schedule a partial update. Multiple calls inside the debounce window
   *  collapse into one PATCH. Later calls override earlier fields. */
  schedule: (patch: Partial<T>) => void
  /** Flush immediately. Called on unmount; safe to call manually. */
  flush: () => Promise<void>
}

/**
 * Debounced PATCH to /api/analyses/[id].
 *
 * Accumulates partial updates and flushes them after `delayMs` of quiet. On
 * unmount, any pending write is flushed so a toggle made right before
 * navigation doesn't get dropped. On error, calls `onError` — the caller is
 * responsible for surfacing the retry affordance. We do NOT revert local state
 * on failure: the user's intent is clear, and a silent revert is worse UX.
 */
export function useDebouncedAnalysisPatch(
  analysisId: number,
  delayMs = 500,
  onError?: (err: unknown) => void,
): DebouncedPatcher<Record<string, unknown>> {
  const pendingRef = useRef<Record<string, unknown>>({})
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const idRef = useRef(analysisId)
  useEffect(() => {
    idRef.current = analysisId
  }, [analysisId])

  const doFlush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const body = pendingRef.current
    pendingRef.current = {}
    if (Object.keys(body).length === 0) return
    try {
      const res = await fetch(`/api/analyses/${idRef.current}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        onError?.(err)
      }
    } catch (e) {
      onError?.(e)
    }
  }, [onError])

  const schedule = useCallback(
    (patch: Record<string, unknown>) => {
      Object.assign(pendingRef.current, patch)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        void doFlush()
      }, delayMs)
    },
    [doFlush, delayMs],
  )

  // Flush on unmount so a toggle right before navigation isn't lost.
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      if (Object.keys(pendingRef.current).length > 0) {
        const body = pendingRef.current
        pendingRef.current = {}
        // Fire-and-forget — component is unmounting.
        void fetch(`/api/analyses/${idRef.current}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          keepalive: true,
        })
      }
    }
  }, [])

  return { schedule, flush: doFlush }
}
