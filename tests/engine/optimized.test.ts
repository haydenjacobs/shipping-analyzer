import { describe, it, expect } from 'vitest'
import { computeProviderOptimized } from '@/lib/engine/optimized'
import type { OrderResult } from '@/types'

/** Build a minimal OrderResult for tests. */
function or(orderId: number, warehouseId: number, cents: number, zone = 5): OrderResult {
  return {
    orderId,
    warehouseId,
    zone,
    billableWeightValue: 1,
    billableWeightUnit: 'lbs',
    dimWeightLbs: null,
    rateCardId: warehouseId,
    baseCostCents: cents,
    surchargeCents: 0,
    totalCostCents: cents,
    calculationNotes: null,
  }
}

describe('computeProviderOptimized — Step 7', () => {
  it('single-location provider: optimized equals that warehouse', () => {
    const results: OrderResult[] = [
      or(1, 100, 400),
      or(2, 100, 600),
    ]
    const out = computeProviderOptimized({
      providerName: 'Solo',
      providerWarehouseIds: [100],
      includedWarehouseIds: [100],
      orderResults: results,
    })!
    expect(out.orderCount).toBe(2)
    expect(out.totalCostCents).toBe(1000)
    expect(out.avgCostCents).toBe(500)
    expect(out.nodeUtilization[100]).toBe(1)
    expect(out.winners.map(w => w.winningWarehouseId)).toEqual([100, 100])
  })

  it('multi-location: picks cheapest per order', () => {
    // Order 1: wh 100=500, wh 101=400 → wh 101
    // Order 2: wh 100=300, wh 101=900 → wh 100
    const results: OrderResult[] = [
      or(1, 100, 500),
      or(1, 101, 400),
      or(2, 100, 300),
      or(2, 101, 900),
    ]
    const out = computeProviderOptimized({
      providerName: 'P',
      providerWarehouseIds: [100, 101],
      includedWarehouseIds: [100, 101],
      orderResults: results,
    })!
    expect(out.winners.find(w => w.orderId === 1)!.winningWarehouseId).toBe(101)
    expect(out.winners.find(w => w.orderId === 2)!.winningWarehouseId).toBe(100)
    expect(out.totalCostCents).toBe(400 + 300)
    expect(out.avgCostCents).toBe(Math.round(700 / 2))
    expect(out.nodeUtilization[100]).toBeCloseTo(0.5)
    expect(out.nodeUtilization[101]).toBeCloseTo(0.5)
  })

  it('excluded locations cannot win, even if cheaper', () => {
    const results: OrderResult[] = [
      or(1, 100, 100), // cheapest — but excluded
      or(1, 101, 500),
      or(1, 102, 300),
    ]
    const out = computeProviderOptimized({
      providerName: 'P',
      providerWarehouseIds: [100, 101, 102],
      includedWarehouseIds: [101, 102],
      orderResults: results,
    })!
    expect(out.winners[0].winningWarehouseId).toBe(102)
    expect(out.winners[0].winningCostCents).toBe(300)
    expect(out.nodeUtilization[100]).toBe(0)
  })

  it('tiebreaker: lowest warehouseId wins on equal cost', () => {
    const results: OrderResult[] = [
      or(1, 200, 500),
      or(1, 101, 500),
      or(1, 350, 500),
    ]
    const out = computeProviderOptimized({
      providerName: 'P',
      providerWarehouseIds: [101, 200, 350],
      includedWarehouseIds: [101, 200, 350],
      orderResults: results,
    })!
    expect(out.winners[0].winningWarehouseId).toBe(101)
  })

  it('1 of M included: optimized equals that single location', () => {
    const results: OrderResult[] = [
      or(1, 100, 500),
      or(1, 101, 400),
    ]
    const out = computeProviderOptimized({
      providerName: 'P',
      providerWarehouseIds: [100, 101],
      includedWarehouseIds: [100],
      orderResults: results,
    })!
    expect(out.orderCount).toBe(1)
    expect(out.totalCostCents).toBe(500)
    expect(out.nodeUtilization[100]).toBe(1)
    expect(out.nodeUtilization[101]).toBe(0)
  })

  it('0 of M included: returns null', () => {
    const out = computeProviderOptimized({
      providerName: 'P',
      providerWarehouseIds: [100, 101],
      includedWarehouseIds: [],
      orderResults: [or(1, 100, 500), or(1, 101, 400)],
    })
    expect(out).toBeNull()
  })

  it('node utilization percentages sum to 1 across included warehouses', () => {
    const results: OrderResult[] = [
      or(1, 100, 100), or(1, 101, 200), or(1, 102, 300),
      or(2, 100, 500), or(2, 101, 200), or(2, 102, 900),
      or(3, 100, 400), or(3, 101, 800), or(3, 102, 300),
    ]
    const out = computeProviderOptimized({
      providerName: 'P',
      providerWarehouseIds: [100, 101, 102],
      includedWarehouseIds: [100, 101, 102],
      orderResults: results,
    })!
    const total = out.nodeUtilization[100] + out.nodeUtilization[101] + out.nodeUtilization[102]
    expect(total).toBeCloseTo(1)
    // winners: order1 → wh100 (100), order2 → wh101 (200), order3 → wh102 (300)
    expect(out.nodeUtilization[100]).toBeCloseTo(1 / 3)
    expect(out.nodeUtilization[101]).toBeCloseTo(1 / 3)
    expect(out.nodeUtilization[102]).toBeCloseTo(1 / 3)
  })

  it('determinism: same inputs → identical output regardless of result order', () => {
    const base: OrderResult[] = [
      or(1, 100, 500), or(1, 101, 400),
      or(2, 100, 300), or(2, 101, 900),
    ]
    const shuffled = [base[3], base[0], base[2], base[1]]
    const a = computeProviderOptimized({
      providerName: 'P', providerWarehouseIds: [100, 101], includedWarehouseIds: [100, 101],
      orderResults: base,
    })!
    const b = computeProviderOptimized({
      providerName: 'P', providerWarehouseIds: [100, 101], includedWarehouseIds: [100, 101],
      orderResults: shuffled,
    })!
    expect(a).toEqual(b)
  })
})
