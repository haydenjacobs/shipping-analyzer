import { describe, it, expect } from 'vitest'
import { lookupRate } from '@/lib/engine/rate-lookup'
import { RateCardEntry } from '@/types'

// Atomix Ground rate card sample
const entries: RateCardEntry[] = [
  // oz rows
  { id: 1, rateCardId: 1, weightValue: 1, weightUnit: 'oz', zone: 5, priceCents: 445 },
  { id: 2, rateCardId: 1, weightValue: 7, weightUnit: 'oz', zone: 5, priceCents: 457 },
  { id: 3, rateCardId: 1, weightValue: 12, weightUnit: 'oz', zone: 7, priceCents: 598 },
  { id: 4, rateCardId: 1, weightValue: 15, weightUnit: 'oz', zone: 6, priceCents: 629 },
  { id: 5, rateCardId: 1, weightValue: 16, weightUnit: 'oz', zone: 2, priceCents: 572 },
  // oz rows with decimal tier
  { id: 9, rateCardId: 1, weightValue: 15, weightUnit: 'oz', zone: 8, priceCents: 700 },
  { id: 10, rateCardId: 1, weightValue: 15.99, weightUnit: 'oz', zone: 8, priceCents: 750 },
  // lbs rows
  { id: 6, rateCardId: 1, weightValue: 2, weightUnit: 'lbs', zone: 6, priceCents: 629 },
  { id: 7, rateCardId: 1, weightValue: 3, weightUnit: 'lbs', zone: 5, priceCents: 730 },
  { id: 8, rateCardId: 1, weightValue: 2, weightUnit: 'lbs', zone: 3, priceCents: 568 },
]

describe('lookupRate', () => {
  it('finds exact match', () => {
    const r = lookupRate(7, 'oz', 5, entries)
    expect(r).toMatchObject({ ok: true, priceCents: 457 })
  })

  it('finds next higher weight when exact not found', () => {
    // 6oz not in entries for zone 5, next >= is 7oz
    const r = lookupRate(6, 'oz', 5, entries)
    expect(r).toMatchObject({ ok: true, priceCents: 457, matchedWeightValue: 7 })
  })

  it('errors when weight exceeds max entry', () => {
    // Zone 5 lbs entries: only 3 lbs. Ask for 10 lbs.
    const r = lookupRate(10, 'lbs', 5, entries)
    expect(r.ok).toBe(false)
    expect((r as { ok: false; error: string }).error).toContain('exceeds max')
  })

  it('errors when no entries for unit/zone combination', () => {
    const r = lookupRate(1, 'lbs', 9, entries)
    expect(r.ok).toBe(false)
  })

  // ── Decimal weight tier tests ────────────────────────────────────────────────

  it('decimal: 15.3 oz matches 15.99 (smallest >= 15.3) for zone 8', () => {
    // entries for zone 8 oz: 15 and 15.99
    // billable = 15.3, which is > 15 but <= 15.99, so should match 15.99
    const r = lookupRate(15.3, 'oz', 8, entries)
    expect(r).toMatchObject({ ok: true, priceCents: 750, matchedWeightValue: 15.99 })
  })

  it('decimal: 15.99 oz matches 15.99 exactly for zone 8', () => {
    const r = lookupRate(15.99, 'oz', 8, entries)
    expect(r).toMatchObject({ ok: true, priceCents: 750, matchedWeightValue: 15.99 })
  })

  it('decimal: 15 oz matches 15 (exact) for zone 8', () => {
    const r = lookupRate(15, 'oz', 8, entries)
    expect(r).toMatchObject({ ok: true, priceCents: 700, matchedWeightValue: 15 })
  })

  it('integer: 1 oz matches 1 exactly (not skipped by >= logic)', () => {
    const r = lookupRate(1, 'oz', 5, entries)
    expect(r).toMatchObject({ ok: true, priceCents: 445, matchedWeightValue: 1 })
  })
})
