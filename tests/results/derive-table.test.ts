import { describe, it, expect } from 'vitest'
import {
  deriveTableModel,
  type MatrixOrder,
  type MatrixWarehouse,
} from '@/lib/results/derive-table'

function wh(id: number, provider: string, label: string): MatrixWarehouse {
  return {
    id,
    provider_name: provider,
    location_label: label,
    origin_zip: '00000',
    origin_zip3: '000',
  }
}

function o(orderId: number, cells: Array<[number, number, number]>): MatrixOrder {
  return {
    order_id: orderId,
    results: cells.map(([warehouse_id, zone, total_cost_cents]) => ({
      warehouse_id,
      zone,
      total_cost_cents,
      billable_weight_value: 1,
      billable_weight_unit: 'lbs' as const,
    })),
  }
}

describe('deriveTableModel', () => {
  it('single-node mode: one flat row per warehouse, sorted by avg cost asc', () => {
    const warehouses = [wh(1, 'A', 'Loc1'), wh(2, 'B', 'Loc2')]
    const matrix = [
      o(10, [[1, 4, 500], [2, 5, 300]]),
      o(11, [[1, 4, 500], [2, 5, 300]]),
    ]
    const model = deriveTableModel({
      warehouses,
      matrix,
      mode: 'single_node',
      excludedWarehouseIds: [],
    })
    expect(model.rows).toHaveLength(2)
    expect(model.rows[0].kind).toBe('single')
    // B is cheaper → first
    expect(model.rows[0].key).toBe('wh-2')
    expect(model.winnerKey).toBe('wh-2')
  })

  it('optimized mode: single-location provider renders as flat row', () => {
    const warehouses = [wh(1, 'Solo', 'One')]
    const matrix = [o(10, [[1, 3, 400]])]
    const model = deriveTableModel({
      warehouses,
      matrix,
      mode: 'optimized',
      excludedWarehouseIds: [],
    })
    expect(model.rows).toHaveLength(1)
    expect(model.rows[0].kind).toBe('single')
  })

  it('optimized mode: multi-location provider renders as provider row with utilization', () => {
    const warehouses = [wh(1, 'Multi', 'A'), wh(2, 'Multi', 'B')]
    // Order 10: wh1=500, wh2=400 → wh2
    // Order 11: wh1=300, wh2=900 → wh1
    const matrix = [o(10, [[1, 5, 500], [2, 6, 400]]), o(11, [[1, 4, 300], [2, 5, 900]])]
    const model = deriveTableModel({
      warehouses,
      matrix,
      mode: 'optimized',
      excludedWarehouseIds: [],
    })
    expect(model.rows).toHaveLength(1)
    const row = model.rows[0]
    expect(row.kind).toBe('provider')
    if (row.kind !== 'provider') return
    expect(row.totalLocations).toBe(2)
    expect(row.includedWarehouseIds).toEqual([1, 2])
    expect(row.avgCostCents).toBe(Math.round((400 + 300) / 2))
    expect(row.nodeUtilization[1]).toBeCloseTo(0.5)
    expect(row.nodeUtilization[2]).toBeCloseTo(0.5)
    expect(row.locations).toHaveLength(2)
    expect(row.locations.every((l) => l.included)).toBe(true)
  })

  it('optimized mode: excluding a location recomputes aggregates and never wins', () => {
    const warehouses = [wh(1, 'Multi', 'A'), wh(2, 'Multi', 'B')]
    const matrix = [o(10, [[1, 5, 100], [2, 6, 500]]), o(11, [[1, 4, 300], [2, 5, 900]])]
    const model = deriveTableModel({
      warehouses,
      matrix,
      mode: 'optimized',
      excludedWarehouseIds: [1],
    })
    const row = model.rows[0]
    expect(row.kind).toBe('provider')
    if (row.kind !== 'provider') return
    expect(row.includedWarehouseIds).toEqual([2])
    expect(row.avgCostCents).toBe(Math.round((500 + 900) / 2))
    expect(row.nodeUtilization[1]).toBe(0)
    expect(row.nodeUtilization[2]).toBe(1)
    // Location entries still include wh1 with included=false
    expect(row.locations.find((l) => l.warehouseId === 1)!.included).toBe(false)
  })

  it('optimized mode: 0 of M moves the provider row to the bottom (allExcluded)', () => {
    const warehouses = [
      wh(1, 'Multi', 'A'),
      wh(2, 'Multi', 'B'),
      wh(3, 'Cheaper', 'Only'),
    ]
    const matrix = [
      o(10, [[1, 5, 500], [2, 5, 400], [3, 5, 100]]),
      o(11, [[1, 4, 300], [2, 4, 300], [3, 4, 100]]),
    ]
    const model = deriveTableModel({
      warehouses,
      matrix,
      mode: 'optimized',
      excludedWarehouseIds: [1, 2],
    })
    // Main row: Cheaper (single-location) is at top. Multi is bottom stub.
    const first = model.rows[0]
    expect(first.kind).toBe('single')
    const last = model.rows[model.rows.length - 1]
    expect(last.kind).toBe('provider')
    if (last.kind !== 'provider') return
    expect(last.allExcluded).toBe(true)
    expect(last.includedWarehouseIds).toEqual([])
    // Winner is NOT the allExcluded stub.
    expect(model.winnerKey).toBe(first.key)
  })

  it('winner is the lowest avg cost row in current mode', () => {
    const warehouses = [wh(1, 'A', 'L'), wh(2, 'B', 'L')]
    const matrix = [o(10, [[1, 4, 500], [2, 5, 200]])]
    const singleNode = deriveTableModel({
      warehouses,
      matrix,
      mode: 'single_node',
      excludedWarehouseIds: [],
    })
    expect(singleNode.winnerKey).toBe('wh-2')
    // Same matrix, optimized mode, both are single-location providers → same winner
    const optimized = deriveTableModel({
      warehouses,
      matrix,
      mode: 'optimized',
      excludedWarehouseIds: [],
    })
    expect(optimized.winnerKey).toBe('wh-2')
  })
})
