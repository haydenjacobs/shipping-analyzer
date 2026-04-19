import { describe, it, expect } from 'vitest'
import { runCalculationEngine } from '@/lib/engine'
import type { EngineInput, TplInput, Order } from '@/types'

/**
 * Integration test using known-good data from the Kase/Milwaukee spreadsheet.
 * These values MUST match exactly. Any discrepancy = a bug.
 *
 * Warehouse: Kase, Milwaukee, WI (ZIP 53154, ZIP3 531)
 * Rate card: Atomix Ground (oz_then_lbs)
 */

// Zone map for origin ZIP3 531 (from spec)
const kaseZoneMap = new Map<string, number>([
  ['040', 5], // order 0001 → 04021
  ['770', 6], // order 0002 → 77077
  ['809', 5], // order 0004 → 80908
  ['853', 7], // order 0005 → 85387
  ['540', 3], // order 0007 → 54011
  ['495', 2], // order 0008 → 49505
])

// Atomix Ground rate card entries (oz_then_lbs)
// Subset needed to verify the 6 test orders
const atomixEntries = [
  // oz rows - zone 5
  { id: 1, rateCardId: 1, weightValue: 7, weightUnit: 'oz' as const, zone: 5, priceCents: 457 },
  // oz rows - zone 6
  { id: 2, rateCardId: 1, weightValue: 15, weightUnit: 'oz' as const, zone: 6, priceCents: 629 },
  // oz rows - zone 7
  { id: 3, rateCardId: 1, weightValue: 12, weightUnit: 'oz' as const, zone: 7, priceCents: 598 },
  // oz rows - zone 2
  { id: 4, rateCardId: 1, weightValue: 16, weightUnit: 'oz' as const, zone: 2, priceCents: 572 },
  // lbs rows
  { id: 5, rateCardId: 1, weightValue: 3, weightUnit: 'lbs' as const, zone: 5, priceCents: 730 },
  { id: 6, rateCardId: 1, weightValue: 2, weightUnit: 'lbs' as const, zone: 3, priceCents: 568 },
]

const kaseTpl = {
  id: 1,
  analysisId: 1,
  name: 'Kase',
  multiNodeEnabled: false,
  dimWeightEnabled: false,
  dimFactor: null,
  surchargeFlatCents: 0,
  notes: null,
  createdAt: '',
}

const kaseLocation = {
  id: 1,
  tplId: 1,
  name: 'Milwaukee, WI',
  originZip: '53154',
  originZip3: '531',
  createdAt: '',
}

const atomixRateCard = {
  id: 1,
  tplId: 1,
  name: 'Atomix Ground',
  weightUnitMode: 'oz_then_lbs' as const,
}

const tplInput: TplInput = {
  tpl: kaseTpl,
  locations: [{ location: kaseLocation, zoneMaps: kaseZoneMap }],
  rateCards: [{ rateCard: atomixRateCard, entries: atomixEntries }],
}

const orders: Order[] = [
  { id: 1, analysisId: 1, orderNumber: '0001', destZip: '04021', destZip3: '040', actualWeightLbs: 0.39, height: 6, width: 5.75, length: 3.5, state: null },
  { id: 2, analysisId: 1, orderNumber: '0002', destZip: '77077', destZip3: '770', actualWeightLbs: 0.937, height: 12, width: 5, length: 5, state: null },
  { id: 3, analysisId: 1, orderNumber: '0004', destZip: '80908', destZip3: '809', actualWeightLbs: 2.795, height: 12, width: 12, length: 9, state: null },
  { id: 4, analysisId: 1, orderNumber: '0005', destZip: '85387', destZip3: '853', actualWeightLbs: 0.743, height: 8, width: 6, length: 4, state: null },
  { id: 5, analysisId: 1, orderNumber: '0007', destZip: '54011', destZip3: '540', actualWeightLbs: 1.001, height: 11, width: 6, length: 5, state: null },
  { id: 6, analysisId: 1, orderNumber: '0008', destZip: '49505', destZip3: '495', actualWeightLbs: 0.981, height: 10, width: 8, length: 4, state: null },
]

const input: EngineInput = { orders, tpls: [tplInput] }

describe('Integration: Kase/Milwaukee Atomix Ground', () => {
  const output = runCalculationEngine(input)

  function getResult(orderNumber: string) {
    const order = orders.find(o => o.orderNumber === orderNumber)!
    return output.orderResults.find(r => r.orderId === order.id)
  }

  it('all 6 orders are included (no exclusions)', () => {
    expect(output.excludedOrders).toHaveLength(0)
    expect(output.includedOrderIds).toHaveLength(6)
  })

  it('produces 6 order results (one per order × one location × one rate card)', () => {
    expect(output.orderResults).toHaveLength(6)
  })

  it('produces 6 best results', () => {
    expect(output.orderBestResults).toHaveLength(6)
  })

  it('order 0001: zone 5, 7oz, $4.57', () => {
    const r = getResult('0001')
    expect(r?.zone).toBe(5)
    expect(r?.billableWeightValue).toBe(7)
    expect(r?.billableWeightUnit).toBe('oz')
    expect(r?.totalCostCents).toBe(457)
  })

  it('order 0002: zone 6, 15oz, $6.29', () => {
    const r = getResult('0002')
    expect(r?.zone).toBe(6)
    expect(r?.billableWeightValue).toBe(15)
    expect(r?.billableWeightUnit).toBe('oz')
    expect(r?.totalCostCents).toBe(629)
  })

  it('order 0004: zone 5, 3lbs, $7.30', () => {
    const r = getResult('0004')
    expect(r?.zone).toBe(5)
    expect(r?.billableWeightValue).toBe(3)
    expect(r?.billableWeightUnit).toBe('lbs')
    expect(r?.totalCostCents).toBe(730)
  })

  it('order 0005: zone 7, 12oz, $5.98', () => {
    const r = getResult('0005')
    expect(r?.zone).toBe(7)
    expect(r?.billableWeightValue).toBe(12)
    expect(r?.billableWeightUnit).toBe('oz')
    expect(r?.totalCostCents).toBe(598)
  })

  it('order 0007: zone 3, 2lbs, $5.68', () => {
    const r = getResult('0007')
    expect(r?.zone).toBe(3)
    expect(r?.billableWeightValue).toBe(2)
    expect(r?.billableWeightUnit).toBe('lbs')
    expect(r?.totalCostCents).toBe(568)
  })

  it('order 0008: zone 2, 16oz, $5.72', () => {
    const r = getResult('0008')
    expect(r?.zone).toBe(2)
    expect(r?.billableWeightValue).toBe(16)
    expect(r?.billableWeightUnit).toBe('oz')
    expect(r?.totalCostCents).toBe(572)
  })

  it('every result has a calculationNotes string', () => {
    for (const r of output.orderResults) {
      expect(r.calculationNotes).toBeTruthy()
    }
  })

  it('tplSummary orderCount = 6', () => {
    expect(output.tplSummaries).toHaveLength(1)
    expect(output.tplSummaries[0].orderCount).toBe(6)
  })

  it('tplSummary zone distribution includes zones 2,3,5,6,7', () => {
    const dist = output.tplSummaries[0].zoneDistribution
    expect(dist[2]).toBe(1)
    expect(dist[3]).toBe(1)
    expect(dist[5]).toBe(2)
    expect(dist[6]).toBe(1)
    expect(dist[7]).toBe(1)
  })
})

describe('Integration: multi-node optimization', () => {
  // Two locations for the same TPL — engine should pick the cheaper one per order
  const cheapZoneMap = new Map<string, number>([['040', 3]]) // zone 3 for dest 040
  const expensiveZoneMap = new Map<string, number>([['040', 7]]) // zone 7 for dest 040

  const cheapEntries = [
    { id: 10, rateCardId: 10, weightValue: 7, weightUnit: 'oz' as const, zone: 3, priceCents: 300 },
  ]
  const expensiveEntries = [
    { id: 11, rateCardId: 10, weightValue: 7, weightUnit: 'oz' as const, zone: 7, priceCents: 700 },
  ]

  const tpl = {
    id: 10,
    analysisId: 1,
    name: 'Multi',
    multiNodeEnabled: true,
    dimWeightEnabled: false,
    dimFactor: null,
    surchargeFlatCents: 0,
    notes: null,
    createdAt: '',
  }
  const loc1 = { id: 10, tplId: 10, name: 'Cheap', originZip: '10001', originZip3: '100', createdAt: '' }
  const loc2 = { id: 11, tplId: 10, name: 'Expensive', originZip: '20001', originZip3: '200', createdAt: '' }
  const rc = { id: 10, tplId: 10, name: 'RC', weightUnitMode: 'oz_then_lbs' as const }

  const multiInput: EngineInput = {
    orders: [{ id: 1, analysisId: 1, orderNumber: 'M001', destZip: '04021', destZip3: '040', actualWeightLbs: 0.39, height: null, width: null, length: null, state: null }],
    tpls: [{
      tpl,
      locations: [
        { location: loc1, zoneMaps: cheapZoneMap },
        { location: loc2, zoneMaps: expensiveZoneMap },
      ],
      rateCards: [{ rateCard: rc, entries: [...cheapEntries, ...expensiveEntries] }],
    }],
  }

  it('picks the cheaper location (300 cents vs 700 cents)', () => {
    const output = runCalculationEngine(multiInput)
    expect(output.orderBestResults).toHaveLength(1)
    expect(output.orderBestResults[0].bestTotalCostCents).toBe(300)
    expect(output.orderBestResults[0].bestLocationId).toBe(10)
  })
})
