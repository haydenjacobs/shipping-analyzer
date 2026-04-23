import { describe, it, expect } from 'vitest'
import { derivePerOrderTable } from '@/lib/results/derive-per-order-table'
import { deriveTableModel, type MatrixOrder, type MatrixWarehouse, type OrderDetail } from '@/lib/results/derive-table'

function wh(id: number, provider: string, label: string): MatrixWarehouse {
  return { id, provider_name: provider, location_label: label, origin_zip: '00000', origin_zip3: '000' }
}

function ord(id: number, num: string, cells: Array<[number, number, number]>): MatrixOrder {
  return {
    order_id: id,
    results: cells.map(([warehouse_id, zone, total_cost_cents]) => ({
      warehouse_id,
      zone,
      total_cost_cents,
      billable_weight_value: 8,
      billable_weight_unit: 'oz' as const,
    })),
  }
}

function detail(id: number, num: string): OrderDetail {
  return {
    id,
    order_number: num,
    actual_weight_lbs: 0.5,
    height: 5,
    width: 5,
    length: 10,
    dest_zip: '12345',
    state: 'NY',
  }
}

describe('derivePerOrderTable', () => {
  it('column headers: order-level first, then per-provider groups in sort order', () => {
    const warehouses = [wh(1, 'Alpha', 'East'), wh(2, 'Beta', 'West')]
    const matrix = [ord(10, 'A', [[1, 4, 600], [2, 4, 400]])]
    const orders = [detail(10, 'A')]
    const tableRows = deriveTableModel({ warehouses, matrix, mode: 'single_node', excludedWarehouseIds: [] }).rows

    const { columns } = derivePerOrderTable({ warehouses, matrix, orders, excludedWarehouseIds: [], tableRows })

    // First 7 should be order-level
    const orderLevelKinds = columns.slice(0, 7).map((c) => c.kind)
    expect(orderLevelKinds).toEqual([
      'order-number', 'actual-weight', 'dims', 'dest-zip', 'state', 'billable-weight', 'billable-unit',
    ])

    // Beta (cheaper) comes first in sort → Beta columns before Alpha
    const betaZoneIdx = columns.findIndex((c) => c.warehouseId === 2 && c.kind === 'warehouse-zone')
    const alphaZoneIdx = columns.findIndex((c) => c.warehouseId === 1 && c.kind === 'warehouse-zone')
    expect(betaZoneIdx).toBeLessThan(alphaZoneIdx)
  })

  it('multi-location provider: per-location pairs then optimized triple at end of group', () => {
    const warehouses = [wh(1, 'Multi', 'A'), wh(2, 'Multi', 'B')]
    const matrix = [ord(10, 'X', [[1, 3, 500], [2, 4, 400]])]
    const orders = [detail(10, 'X')]
    const tableRows = deriveTableModel({ warehouses, matrix, mode: 'optimized', excludedWarehouseIds: [] }).rows

    const { columns } = derivePerOrderTable({ warehouses, matrix, orders, excludedWarehouseIds: [], tableRows })

    const kinds = columns.map((c) => c.kind)
    // After order-level cols, should have: wh-zone, wh-cost, wh-zone, wh-cost, opt-zone, opt-cost, opt-winner
    const providerCols = kinds.slice(7)
    expect(providerCols).toEqual([
      'warehouse-zone', 'warehouse-cost',
      'warehouse-zone', 'warehouse-cost',
      'opt-zone', 'opt-cost', 'opt-winner',
    ])

    const optWinnerCol = columns.find((c) => c.kind === 'opt-winner')
    expect(optWinnerCol?.providerName).toBe('Multi')
  })

  it('winning location matches the minimum cost warehouse among included locations', () => {
    const warehouses = [wh(1, 'Multi', 'A'), wh(2, 'Multi', 'B')]
    // wh1=800, wh2=400 → wh2 wins (B)
    const matrix = [ord(10, 'X', [[1, 3, 800], [2, 4, 400]])]
    const orders = [detail(10, 'X')]
    const tableRows = deriveTableModel({ warehouses, matrix, mode: 'optimized', excludedWarehouseIds: [] }).rows

    const { rows } = derivePerOrderTable({ warehouses, matrix, orders, excludedWarehouseIds: [], tableRows })
    expect(rows).toHaveLength(1)
    expect(rows[0].optWinners['Multi']).toBe('B')
    expect(rows[0].optCosts['Multi']).toBe(400)
    expect(rows[0].optZones['Multi']).toBe(4)
  })

  it('excluded locations still have zone/cost cells but never appear as opt winner', () => {
    const warehouses = [wh(1, 'Multi', 'A'), wh(2, 'Multi', 'B')]
    // wh1 cheaper but excluded → wh2 must win
    const matrix = [ord(10, 'X', [[1, 2, 100], [2, 5, 500]])]
    const orders = [detail(10, 'X')]
    const tableRows = deriveTableModel({ warehouses, matrix, mode: 'optimized', excludedWarehouseIds: [1] }).rows

    const { columns, rows } = derivePerOrderTable({ warehouses, matrix, orders, excludedWarehouseIds: [1], tableRows })

    // wh1 column should still exist (auditability)
    const wh1ZoneCol = columns.find((c) => c.warehouseId === 1 && c.kind === 'warehouse-zone')
    expect(wh1ZoneCol).toBeDefined()

    // Row has wh1 zone/cost data
    expect(rows[0].warehouseZones[1]).toBe(2)
    expect(rows[0].warehouseCosts[1]).toBe(100)

    // But wh1 (A) must never be the winner
    expect(rows[0].optWinners['Multi']).toBe('B')
    expect(rows[0].optCosts['Multi']).toBe(500)
  })

  it('tiebreaker: lower warehouseId wins when costs are equal', () => {
    const warehouses = [wh(1, 'Multi', 'A'), wh(2, 'Multi', 'B')]
    // Equal cost — wh1 should win (lower id)
    const matrix = [ord(10, 'X', [[1, 3, 400], [2, 3, 400]])]
    const orders = [detail(10, 'X')]
    const tableRows = deriveTableModel({ warehouses, matrix, mode: 'optimized', excludedWarehouseIds: [] }).rows

    const { rows } = derivePerOrderTable({ warehouses, matrix, orders, excludedWarehouseIds: [], tableRows })
    expect(rows[0].optWinners['Multi']).toBe('A') // wh1 wins
  })

  it('dims formatted correctly; null dims render null', () => {
    const warehouses = [wh(1, 'A', 'L')]
    const matrix = [ord(10, 'X', [[1, 3, 400]])]
    const withDims: OrderDetail = { id: 10, order_number: 'X', actual_weight_lbs: 1, height: 6, width: 5, length: 10, dest_zip: '11111', state: null }
    const noDims: OrderDetail = { id: 10, order_number: 'X', actual_weight_lbs: 1, height: null, width: null, length: null, dest_zip: '11111', state: null }
    const tableRows = deriveTableModel({ warehouses, matrix, mode: 'single_node', excludedWarehouseIds: [] }).rows

    const { rows: rowsA } = derivePerOrderTable({ warehouses, matrix, orders: [withDims], excludedWarehouseIds: [], tableRows })
    expect(rowsA[0].dims).toBe('10×5×6')

    const { rows: rowsB } = derivePerOrderTable({ warehouses, matrix, orders: [noDims], excludedWarehouseIds: [], tableRows })
    expect(rowsB[0].dims).toBeNull()
  })

  it('pagination: function returns all rows; caller slices', () => {
    const warehouses = [wh(1, 'A', 'L')]
    const matrix = Array.from({ length: 1000 }, (_, i) =>
      ord(i + 1, `ORD-${i + 1}`, [[1, 3, 400]]),
    )
    const orders = Array.from({ length: 1000 }, (_, i) => detail(i + 1, `ORD-${i + 1}`))
    const tableRows = deriveTableModel({ warehouses, matrix, mode: 'single_node', excludedWarehouseIds: [] }).rows

    const { rows } = derivePerOrderTable({ warehouses, matrix, orders, excludedWarehouseIds: [], tableRows })

    // All 1000 rows returned — component handles slicing to 500
    expect(rows).toHaveLength(1000)
    // "Page 1" is just a slice
    expect(rows.slice(0, 500)).toHaveLength(500)
    expect(rows.slice(500)).toHaveLength(500)
  })
})
