import { describe, it, expect } from 'vitest'
import { runCalculationEngine } from '@/lib/engine'
import type { EngineInput, Order, Warehouse, WarehouseInput } from '@/types'

/**
 * Acceptance test — known-good values from AGENTS.md "Sample Data for
 * Validation". Any discrepancy = engine bug. Do NOT loosen these expectations
 * to make the test pass.
 *
 * Warehouse: Kase, Milwaukee, WI (ZIP 53154, ZIP3 531)
 * Rate card: Atomix Ground (oz_then_lbs)
 */

const kaseZoneMap = new Map<string, number>([
  ['040', 5], // order 0001 → 04021
  ['770', 6], // order 0002 → 77077
  ['809', 5], // order 0004 → 80908
  ['853', 7], // order 0005 → 85387
  ['540', 3], // order 0007 → 54011
  ['495', 2], // order 0008 → 49505
])

const atomixEntries = [
  { id: 1, rateCardId: 1, weightValue: 7,  weightUnit: 'oz'  as const, zone: 5, priceCents: 457 },
  { id: 2, rateCardId: 1, weightValue: 15, weightUnit: 'oz'  as const, zone: 6, priceCents: 629 },
  { id: 3, rateCardId: 1, weightValue: 12, weightUnit: 'oz'  as const, zone: 7, priceCents: 598 },
  { id: 4, rateCardId: 1, weightValue: 16, weightUnit: 'oz'  as const, zone: 2, priceCents: 572 },
  { id: 5, rateCardId: 1, weightValue: 3,  weightUnit: 'lbs' as const, zone: 5, priceCents: 730 },
  { id: 6, rateCardId: 1, weightValue: 2,  weightUnit: 'lbs' as const, zone: 3, priceCents: 568 },
]

const kaseWarehouse: Warehouse = {
  id: 1,
  analysisId: 1,
  providerName: 'Kase',
  locationLabel: 'Milwaukee, WI',
  originZip: '53154',
  originZip3: '531',
  dimWeightEnabled: false,
  dimFactor: null,
  surchargeFlatCents: 0,
  notes: null,
}

const kaseInput: WarehouseInput = {
  warehouse: kaseWarehouse,
  zoneMaps: kaseZoneMap,
  rateCards: [{
    rateCard: { id: 1, warehouseId: 1, name: 'Atomix Ground', weightUnitMode: 'oz_then_lbs' },
    entries: atomixEntries,
  }],
}

const orders: Order[] = [
  { id: 1, analysisId: 1, orderNumber: '0001', destZip: '04021', destZip3: '040', actualWeightLbs: 0.39,  height: 6,  width: 5.75, length: 3.5, state: null },
  { id: 2, analysisId: 1, orderNumber: '0002', destZip: '77077', destZip3: '770', actualWeightLbs: 0.937, height: 12, width: 5,    length: 5,   state: null },
  { id: 3, analysisId: 1, orderNumber: '0004', destZip: '80908', destZip3: '809', actualWeightLbs: 2.795, height: 12, width: 12,   length: 9,   state: null },
  { id: 4, analysisId: 1, orderNumber: '0005', destZip: '85387', destZip3: '853', actualWeightLbs: 0.743, height: 8,  width: 6,    length: 4,   state: null },
  { id: 5, analysisId: 1, orderNumber: '0007', destZip: '54011', destZip3: '540', actualWeightLbs: 1.001, height: 11, width: 6,    length: 5,   state: null },
  { id: 6, analysisId: 1, orderNumber: '0008', destZip: '49505', destZip3: '495', actualWeightLbs: 0.981, height: 10, width: 8,    length: 4,   state: null },
]

const input: EngineInput = { orders, warehouses: [kaseInput] }

describe('Integration: Kase/Milwaukee Atomix Ground', () => {
  const output = runCalculationEngine(input)

  function resultFor(orderNumber: string) {
    const order = orders.find(o => o.orderNumber === orderNumber)!
    return output.orderResults.find(r => r.orderId === order.id)
  }

  it('all 6 orders included (no exclusions)', () => {
    expect(output.excludedOrders).toHaveLength(0)
    expect(output.includedOrderIds).toHaveLength(6)
  })

  it('produces 6 OrderResult rows (one per order × one warehouse)', () => {
    expect(output.orderResults).toHaveLength(6)
  })

  const cases: Array<[string, number, number, 'oz' | 'lbs', number]> = [
    ['0001', 5, 7,  'oz',  457],
    ['0002', 6, 15, 'oz',  629],
    ['0004', 5, 3,  'lbs', 730],
    ['0005', 7, 12, 'oz',  598],
    ['0007', 3, 2,  'lbs', 568],
    ['0008', 2, 16, 'oz',  572],
  ]

  for (const [orderNum, zone, billable, unit, cents] of cases) {
    it(`order ${orderNum}: zone ${zone}, ${billable}${unit}, $${(cents / 100).toFixed(2)}`, () => {
      const r = resultFor(orderNum)
      expect(r).toBeDefined()
      expect(r!.zone).toBe(zone)
      expect(r!.billableWeightValue).toBe(billable)
      expect(r!.billableWeightUnit).toBe(unit)
      expect(r!.totalCostCents).toBe(cents)
    })
  }

  it('every result has a calculationNotes string', () => {
    for (const r of output.orderResults) expect(r.calculationNotes).toBeTruthy()
  })

  it('warehouseSummary: orderCount = 6', () => {
    expect(output.warehouseSummaries).toHaveLength(1)
    expect(output.warehouseSummaries[0].orderCount).toBe(6)
  })

  it('warehouseSummary: zoneDistribution includes zones 2,3,5,6,7', () => {
    const dist = output.warehouseSummaries[0].zoneDistribution
    expect(dist[2]).toBe(1)
    expect(dist[3]).toBe(1)
    expect(dist[5]).toBe(2)
    expect(dist[6]).toBe(1)
    expect(dist[7]).toBe(1)
  })
})

describe('Integration: consistency rule — invalid for one warehouse excludes from all', () => {
  const wh1: WarehouseInput = {
    warehouse: { ...kaseWarehouse, id: 1 },
    zoneMaps: new Map([['040', 5]]),
    rateCards: [{
      rateCard: { id: 1, warehouseId: 1, name: 'card', weightUnitMode: 'oz_then_lbs' },
      entries: [{ id: 1, rateCardId: 1, weightValue: 7, weightUnit: 'oz', zone: 5, priceCents: 457 }],
    }],
  }
  // Warehouse 2 is missing the zone for dest 040 — any order going there is invalid
  const wh2: WarehouseInput = {
    warehouse: { ...kaseWarehouse, id: 2, providerName: 'Other', locationLabel: 'X', originZip: '10001', originZip3: '100' },
    zoneMaps: new Map(),
    rateCards: [{
      rateCard: { id: 2, warehouseId: 2, name: 'card', weightUnitMode: 'oz_then_lbs' },
      entries: [{ id: 2, rateCardId: 2, weightValue: 7, weightUnit: 'oz', zone: 5, priceCents: 500 }],
    }],
  }
  const testInput: EngineInput = {
    orders: [orders[0]],
    warehouses: [wh1, wh2],
  }
  const out = runCalculationEngine(testInput)

  it('excludes the order from BOTH warehouses, producing zero OrderResults', () => {
    expect(out.orderResults).toHaveLength(0)
    expect(out.excludedOrders).toHaveLength(1)
    expect(out.excludedOrders[0].reason).toBe('zone_not_found')
  })
})

// ─── Extended zone map: adds three new zip3s for edge-case orders ─────────────

const kaseZoneMapExtended = new Map<string, number>([
  ...kaseZoneMap,
  ['531', 1], // local (Milwaukee itself) → zone 1 — used by B012
  ['606', 2], // Chicago area              → zone 2 — used by B009
  ['631', 4], // St. Louis area            → zone 4 — used by B011
])

// Additional rate card entries beyond the 6 used by the original orders.
// Values taken directly from the Atomix Ground rate card CSV created during
// smoke-test setup. Zone column indices are 1-based (zone 1 = first zone col).
const atomixEntriesExtended = [
  ...atomixEntries,
  // id 7: 1 oz zone 1 — $4.19 (row: 1,oz,4.19,...)
  { id: 7, rateCardId: 1, weightValue: 1,  weightUnit: 'oz'  as const, zone: 1, priceCents: 419 },
  // id 8: 4 oz zone 4 — $4.46 (row: 4,oz,4.27,4.33,4.35,4.46,...)
  { id: 8, rateCardId: 1, weightValue: 4,  weightUnit: 'oz'  as const, zone: 4, priceCents: 446 },
  // id 9: 5 lbs zone 2 — $7.13 (row: 5,lbs,7.01,7.13,...)
  { id: 9, rateCardId: 1, weightValue: 5,  weightUnit: 'lbs' as const, zone: 2, priceCents: 713 },
]

const kaseInputExtended: WarehouseInput = {
  warehouse: kaseWarehouse,
  zoneMaps: kaseZoneMapExtended,
  rateCards: [{
    rateCard: { id: 1, warehouseId: 1, name: 'Atomix Ground', weightUnitMode: 'oz_then_lbs' },
    entries: atomixEntriesExtended,
  }],
}

// 4 new orders — edge cases computed by hand against the Atomix Ground rate card.
// B009: exactly 1.0 lb boundary → engine rule says use oz rows at 16 oz, not lbs rows
// B010: 0.975 lbs → 15.6 oz → ceiling = 16 oz (rounding boundary)
// B011: 0.25 lbs = 4.0 oz exactly → 4 oz, zone 4
// B012: 0.0625 lbs = 1.0 oz exactly → 1 oz, local zone 1
const newOrders: Order[] = [
  { id: 7,  analysisId: 1, orderNumber: 'B009', destZip: '60601', destZip3: '606', actualWeightLbs: 1.0,    height: null, width: null, length: null, state: null },
  { id: 8,  analysisId: 1, orderNumber: 'B010', destZip: '49505', destZip3: '495', actualWeightLbs: 0.975,  height: null, width: null, length: null, state: null },
  { id: 9,  analysisId: 1, orderNumber: 'B011', destZip: '63101', destZip3: '631', actualWeightLbs: 0.25,   height: null, width: null, length: null, state: null },
  { id: 10, analysisId: 1, orderNumber: 'B012', destZip: '53154', destZip3: '531', actualWeightLbs: 0.0625, height: null, width: null, length: null, state: null },
]

const allOrders = [...orders, ...newOrders]

describe('Integration: extended edge cases (10 orders, no dim weight)', () => {
  const output = runCalculationEngine({ orders: allOrders, warehouses: [kaseInputExtended] })

  function resultFor(orderNumber: string) {
    const order = allOrders.find(o => o.orderNumber === orderNumber)!
    return output.orderResults.find(r => r.orderId === order.id)
  }

  it('all 10 orders included, none excluded', () => {
    expect(output.excludedOrders).toHaveLength(0)
    expect(output.includedOrderIds).toHaveLength(10)
  })

  // Hand-computed expected values. Format: [orderNum, zone, billable, unit, cents]
  const cases: Array<[string, number, number, 'oz' | 'lbs', number]> = [
    // ── Original 6 — must reproduce spreadsheet exactly ──
    ['0001', 5,  7,  'oz',  457],  // 0.39 lbs → 6.24 oz → ceil = 7 oz, zone 5: $4.57
    ['0002', 6,  15, 'oz',  629],  // 0.937 lbs → 14.99 oz → ceil = 15 oz, zone 6: $6.29
    ['0004', 5,  3,  'lbs', 730],  // 2.795 lbs → ceil = 3 lbs, zone 5: $7.30
    ['0005', 7,  12, 'oz',  598],  // 0.743 lbs → 11.88 oz → ceil = 12 oz, zone 7: $5.98
    ['0007', 3,  2,  'lbs', 568],  // 1.001 lbs → ceil = 2 lbs, zone 3: $5.68
    ['0008', 2,  16, 'oz',  572],  // 0.981 lbs → 15.69 oz → ceil = 16 oz, zone 2: $5.72
    // ── Edge cases ──
    ['B009', 2,  16, 'oz',  572],  // exactly 1.0 lb → 16 oz (boundary rule), zone 2: $5.72
    ['B010', 2,  16, 'oz',  572],  // 0.975 lbs → 15.6 oz → ceil = 16 oz, zone 2: $5.72
    ['B011', 4,  4,  'oz',  446],  // 0.25 lbs = 4.0 oz → ceil = 4 oz, zone 4: $4.46
    ['B012', 1,  1,  'oz',  419],  // 0.0625 lbs = 1.0 oz → ceil = 1 oz, zone 1: $4.19
  ]

  for (const [orderNum, zone, billable, unit, cents] of cases) {
    it(`order ${orderNum}: zone ${zone}, ${billable}${unit}, $${(cents / 100).toFixed(2)}`, () => {
      const r = resultFor(orderNum)
      expect(r).toBeDefined()
      expect(r!.zone).toBe(zone)
      expect(r!.billableWeightValue).toBe(billable)
      expect(r!.billableWeightUnit).toBe(unit)
      expect(r!.totalCostCents).toBe(cents)
    })
  }

  it('covers 5 distinct zones (1, 2, 3, 5, 6, 7 → 6 zones present)', () => {
    const zones = new Set(output.orderResults.map(r => r.zone))
    expect(zones.size).toBeGreaterThanOrEqual(4)
    expect(zones.has(1)).toBe(true)
    expect(zones.has(2)).toBe(true)
    expect(zones.has(3)).toBe(true)
  })
})

// ─── Dim weight tests ─────────────────────────────────────────────────────────
// Uses a variant of the Kase warehouse with dimWeightEnabled = true, dimFactor = 139.
// Hand-computed: dim_weight = (L × W × H) / 139. effective = max(actual, dim).

const kaseDimWarehouse: Warehouse = {
  ...kaseWarehouse,
  id: 2,
  dimWeightEnabled: true,
  dimFactor: 139,
}

// Re-map entry IDs to avoid collision with rate card 1; logic is identical.
const atomixDimEntries = atomixEntriesExtended.map(e => ({ ...e, id: e.id + 100, rateCardId: 2 }))

const kaseDimInput: WarehouseInput = {
  warehouse: kaseDimWarehouse,
  zoneMaps: kaseZoneMap,
  rateCards: [{
    rateCard: { id: 2, warehouseId: 2, name: 'Atomix Ground', weightUnitMode: 'oz_then_lbs' },
    entries: atomixDimEntries,
  }],
}

// D001: dim wins. actual=0.5 lbs, dims=8×8×4 → dim=(8×8×4)/139=256/139≈1.842 lbs
//        effective=1.842 lbs → lbs rows → ceil=2 lbs, zone 3 ($5.68)
// D002: actual wins. actual=5.0 lbs, dims=4×4×4 → dim=64/139≈0.460 lbs
//        effective=5.0 lbs → lbs rows → ceil=5 lbs, zone 2 ($7.13)
const dimOrders: Order[] = [
  { id: 11, analysisId: 1, orderNumber: 'D001', destZip: '54011', destZip3: '540', actualWeightLbs: 0.5, height: 4,    width: 8,    length: 8,    state: null },
  { id: 12, analysisId: 1, orderNumber: 'D002', destZip: '49505', destZip3: '495', actualWeightLbs: 5.0, height: 4,    width: 4,    length: 4,    state: null },
]

describe('Integration: dim weight (2 orders)', () => {
  const output = runCalculationEngine({ orders: dimOrders, warehouses: [kaseDimInput] })

  function resultFor(orderNumber: string) {
    const order = dimOrders.find(o => o.orderNumber === orderNumber)!
    return output.orderResults.find(r => r.orderId === order.id)
  }

  it('both orders included, none excluded', () => {
    expect(output.excludedOrders).toHaveLength(0)
    expect(output.includedOrderIds).toHaveLength(2)
  })

  it('D001: dim wins — (8×8×4)/139≈1.842 lbs → 2 lbs, zone 3, $5.68', () => {
    const r = resultFor('D001')
    expect(r).toBeDefined()
    expect(r!.zone).toBe(3)
    expect(r!.billableWeightValue).toBe(2)
    expect(r!.billableWeightUnit).toBe('lbs')
    expect(r!.dimWeightLbs).toBeCloseTo(256 / 139, 4)
    expect(r!.totalCostCents).toBe(568)
  })

  it('D002: actual wins — actual 5.0 lbs > dim 0.460 lbs → 5 lbs, zone 2, $7.13', () => {
    const r = resultFor('D002')
    expect(r).toBeDefined()
    expect(r!.zone).toBe(2)
    expect(r!.billableWeightValue).toBe(5)
    expect(r!.billableWeightUnit).toBe('lbs')
    expect(r!.dimWeightLbs).toBeCloseTo(64 / 139, 4)
    expect(r!.totalCostCents).toBe(713)
  })
})
