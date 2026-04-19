import { describe, it, expect } from 'vitest'
import { calculateBillableWeight } from '@/lib/engine/weight-calc'

describe('calculateBillableWeight', () => {
  // oz_then_lbs mode
  describe('oz_then_lbs', () => {
    const mode = 'oz_then_lbs'

    it('0.39 lbs → 7oz (6.24 oz, ceiling = 7)', () => {
      const r = calculateBillableWeight({ actualWeightLbs: 0.39, dimWeightEnabled: false, weightUnitMode: mode })
      expect(r).toMatchObject({ ok: true, billableWeightValue: 7, billableWeightUnit: 'oz' })
    })

    it('0.937 lbs → 15oz (14.992 oz, ceiling = 15)', () => {
      const r = calculateBillableWeight({ actualWeightLbs: 0.937, dimWeightEnabled: false, weightUnitMode: mode })
      expect(r).toMatchObject({ ok: true, billableWeightValue: 15, billableWeightUnit: 'oz' })
    })

    it('0.743 lbs → 12oz (11.888 oz, ceiling = 12)', () => {
      const r = calculateBillableWeight({ actualWeightLbs: 0.743, dimWeightEnabled: false, weightUnitMode: mode })
      expect(r).toMatchObject({ ok: true, billableWeightValue: 12, billableWeightUnit: 'oz' })
    })

    it('0.981 lbs → 16oz (15.696 oz, ceiling = 16)', () => {
      const r = calculateBillableWeight({ actualWeightLbs: 0.981, dimWeightEnabled: false, weightUnitMode: mode })
      expect(r).toMatchObject({ ok: true, billableWeightValue: 16, billableWeightUnit: 'oz' })
    })

    it('1.0 lbs exactly → 16oz (boundary: oz side)', () => {
      const r = calculateBillableWeight({ actualWeightLbs: 1.0, dimWeightEnabled: false, weightUnitMode: mode })
      expect(r).toMatchObject({ ok: true, billableWeightValue: 16, billableWeightUnit: 'oz' })
    })

    it('1.001 lbs → 2 lbs (just over 1 lb, ceiling = 2)', () => {
      const r = calculateBillableWeight({ actualWeightLbs: 1.001, dimWeightEnabled: false, weightUnitMode: mode })
      expect(r).toMatchObject({ ok: true, billableWeightValue: 2, billableWeightUnit: 'lbs' })
    })

    it('2.795 lbs → 3 lbs', () => {
      const r = calculateBillableWeight({ actualWeightLbs: 2.795, dimWeightEnabled: false, weightUnitMode: mode })
      expect(r).toMatchObject({ ok: true, billableWeightValue: 3, billableWeightUnit: 'lbs' })
    })

    it('dim weight overrides actual weight when larger', () => {
      // 9×12×12 / 139 = 9.31 lbs → ceiling = 10
      const r = calculateBillableWeight({
        actualWeightLbs: 2.795,
        length: 9, width: 12, height: 12,
        dimWeightEnabled: true,
        dimFactor: 139,
        weightUnitMode: mode,
      })
      // dim = 9*12*12/139 = 9.30935... → effective = 9.30935 > 2.795 → 10 lbs
      expect(r).toMatchObject({ ok: true, billableWeightValue: 10, billableWeightUnit: 'lbs' })
    })

    it('actual weight wins when larger than dim weight', () => {
      // actual = 5.0 lbs, dim = 2.0 → effective = 5.0
      const r = calculateBillableWeight({
        actualWeightLbs: 5.0,
        length: 4, width: 4, height: 4,
        dimWeightEnabled: true,
        dimFactor: 139,
        weightUnitMode: mode,
      })
      expect(r).toMatchObject({ ok: true, billableWeightValue: 5, billableWeightUnit: 'lbs' })
    })
  })

  describe('lbs_only', () => {
    it('0.5 lbs → 1 lb (minimum 1)', () => {
      const r = calculateBillableWeight({ actualWeightLbs: 0.5, dimWeightEnabled: false, weightUnitMode: 'lbs_only' })
      expect(r).toMatchObject({ ok: true, billableWeightValue: 1, billableWeightUnit: 'lbs' })
    })

    it('2.1 lbs → 3 lbs', () => {
      const r = calculateBillableWeight({ actualWeightLbs: 2.1, dimWeightEnabled: false, weightUnitMode: 'lbs_only' })
      expect(r).toMatchObject({ ok: true, billableWeightValue: 3, billableWeightUnit: 'lbs' })
    })
  })

  describe('oz_only', () => {
    it('0.5 lbs → 8 oz', () => {
      const r = calculateBillableWeight({ actualWeightLbs: 0.5, dimWeightEnabled: false, weightUnitMode: 'oz_only' })
      expect(r).toMatchObject({ ok: true, billableWeightValue: 8, billableWeightUnit: 'oz' })
    })
  })
})
