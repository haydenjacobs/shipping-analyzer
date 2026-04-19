import { describe, it, expect } from 'vitest'
import { lookupZone } from '@/lib/engine/zone-lookup'

describe('lookupZone', () => {
  const zoneMaps = new Map<string, number>([
    ['040', 5],
    ['770', 6],
    ['809', 5],
    ['853', 7],
    ['540', 3],
    ['495', 2],
  ])

  it('returns zone for valid ZIP3', () => {
    expect(lookupZone('040', zoneMaps)).toEqual({ ok: true, zone: 5 })
    expect(lookupZone('770', zoneMaps)).toEqual({ ok: true, zone: 6 })
  })

  it('returns error for missing ZIP3', () => {
    const result = lookupZone('999', zoneMaps)
    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toContain('999')
  })
})
