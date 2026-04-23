import { describe, it, expect } from 'vitest'
import { deriveZoneDistribution } from '@/lib/results/derive-zone-distribution'
import { deriveTableModel, type MatrixOrder, type MatrixWarehouse } from '@/lib/results/derive-table'

function wh(id: number, provider: string, label: string): MatrixWarehouse {
  return { id, provider_name: provider, location_label: label, origin_zip: '00000', origin_zip3: '000' }
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

describe('deriveZoneDistribution', () => {
  it('single-node: one row per warehouse, zone counts correct', () => {
    const warehouses = [wh(1, 'A', 'Loc1'), wh(2, 'B', 'Loc2')]
    const matrix = [
      o(10, [[1, 3, 400], [2, 5, 300]]),
      o(11, [[1, 3, 400], [2, 6, 350]]),
      o(12, [[1, 4, 420], [2, 5, 310]]),
    ]
    const tableRows = deriveTableModel({ warehouses, matrix, mode: 'single_node', excludedWarehouseIds: [] }).rows

    const rows = deriveZoneDistribution({ warehouses, matrix, mode: 'single_node', excludedWarehouseIds: [], tableRows })

    expect(rows).toHaveLength(2)

    const rowA = rows.find((r) => r.label.includes('A'))!
    expect(rowA.total).toBe(3)
    expect(rowA.zones[3]).toBe(2)
    expect(rowA.zones[4]).toBe(1)
    expect(rowA.zones[5]).toBeUndefined()

    // Percentages sum to 100%
    const pctSum = Object.values(rowA.zones).reduce((s, c) => s + (c / rowA.total) * 100, 0)
    expect(pctSum).toBeCloseTo(100, 5)

    const rowB = rows.find((r) => r.label.includes('B'))!
    expect(rowB.zones[5]).toBe(2)
    expect(rowB.zones[6]).toBe(1)
  })

  it('optimized: single-location provider equivalent to single-node', () => {
    const warehouses = [wh(1, 'Solo', 'Only')]
    const matrix = [o(10, [[1, 4, 500]]), o(11, [[1, 5, 600]])]
    const tableRows = deriveTableModel({ warehouses, matrix, mode: 'optimized', excludedWarehouseIds: [] }).rows

    const rows = deriveZoneDistribution({ warehouses, matrix, mode: 'optimized', excludedWarehouseIds: [], tableRows })
    expect(rows).toHaveLength(1)
    expect(rows[0].zones[4]).toBe(1)
    expect(rows[0].zones[5]).toBe(1)
    expect(rows[0].total).toBe(2)
  })

  it('optimized: multi-location provider uses winning warehouse zone per order', () => {
    const warehouses = [wh(1, 'Multi', 'A'), wh(2, 'Multi', 'B')]
    // Order 10: wh1=500 zone3, wh2=400 zone6 → wh2 wins → zone 6
    // Order 11: wh1=300 zone2, wh2=900 zone7 → wh1 wins → zone 2
    const matrix = [
      o(10, [[1, 3, 500], [2, 6, 400]]),
      o(11, [[1, 2, 300], [2, 7, 900]]),
    ]
    const tableRows = deriveTableModel({ warehouses, matrix, mode: 'optimized', excludedWarehouseIds: [] }).rows

    const rows = deriveZoneDistribution({ warehouses, matrix, mode: 'optimized', excludedWarehouseIds: [], tableRows })
    expect(rows).toHaveLength(1)
    const row = rows[0]
    expect(row.label).toBe('Multi')
    expect(row.zones[6]).toBe(1) // order 10 winner at zone 6
    expect(row.zones[2]).toBe(1) // order 11 winner at zone 2
    expect(row.total).toBe(2)
    // wh1's zone 3 and wh2's zone 7 should NOT appear (they lost)
    expect(row.zones[3]).toBeUndefined()
    expect(row.zones[7]).toBeUndefined()
  })

  it('optimized: excluded location does not contribute to provider zone distribution', () => {
    const warehouses = [wh(1, 'Multi', 'A'), wh(2, 'Multi', 'B')]
    // wh1 always cheaper but excluded; wh2 must be the winner
    const matrix = [
      o(10, [[1, 2, 100], [2, 5, 500]]),
      o(11, [[1, 3, 200], [2, 6, 600]]),
    ]
    const tableRows = deriveTableModel({ warehouses, matrix, mode: 'optimized', excludedWarehouseIds: [1] }).rows

    const rows = deriveZoneDistribution({ warehouses, matrix, mode: 'optimized', excludedWarehouseIds: [1], tableRows })
    expect(rows).toHaveLength(1)
    const row = rows[0]
    // Only wh2's zones should appear
    expect(row.zones[5]).toBe(1)
    expect(row.zones[6]).toBe(1)
    // wh1's zones must not appear
    expect(row.zones[2]).toBeUndefined()
    expect(row.zones[3]).toBeUndefined()
  })

  it('optimized: 0-of-M provider is omitted from chart data entirely', () => {
    const warehouses = [wh(1, 'Multi', 'A'), wh(2, 'Multi', 'B'), wh(3, 'Cheap', 'Only')]
    const matrix = [
      o(10, [[1, 4, 500], [2, 5, 400], [3, 3, 100]]),
    ]
    const tableRows = deriveTableModel({ warehouses, matrix, mode: 'optimized', excludedWarehouseIds: [1, 2] }).rows

    const rows = deriveZoneDistribution({ warehouses, matrix, mode: 'optimized', excludedWarehouseIds: [1, 2], tableRows })
    // Only 'Cheap' (single-location) should appear; 'Multi' (0 of 2) should not
    expect(rows).toHaveLength(1)
    expect(rows[0].label).toBe('Cheap')
  })

  it('single-node sort order matches tableRow sort (cheapest warehouse first)', () => {
    const warehouses = [wh(1, 'A', 'Expensive'), wh(2, 'B', 'Cheap')]
    const matrix = [
      o(10, [[1, 4, 1000], [2, 4, 200]]),
    ]
    const tableRows = deriveTableModel({ warehouses, matrix, mode: 'single_node', excludedWarehouseIds: [] }).rows
    // tableRows should have wh2 first (cheaper)
    expect(tableRows[0].key).toBe('wh-2')

    const rows = deriveZoneDistribution({ warehouses, matrix, mode: 'single_node', excludedWarehouseIds: [], tableRows })
    expect(rows[0].label).toContain('B')
    expect(rows[1].label).toContain('A')
  })
})
