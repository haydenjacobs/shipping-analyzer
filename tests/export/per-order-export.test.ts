import { describe, it, expect } from 'vitest'
import { buildPerOrderExport } from '@/lib/export/per-order-export'
import type { PerOrderTableResult } from '@/lib/results/derive-per-order-table'

function baseTable(): PerOrderTableResult {
  return {
    columns: [
      { key: 'order-number', header: 'Order #', kind: 'order-number' },
      { key: 'actual-weight', header: 'Actual Weight (lbs)', kind: 'actual-weight' },
      { key: 'dims', header: 'Dims (L × W × H)', kind: 'dims' },
      { key: 'dest-zip', header: 'Dest ZIP', kind: 'dest-zip' },
      { key: 'state', header: 'State', kind: 'state' },
      { key: 'billable-weight', header: 'Billable Weight', kind: 'billable-weight' },
      { key: 'billable-unit', header: 'Billable Unit', kind: 'billable-unit' },
      { key: 'wh-zone-1', header: 'P — East Zone', kind: 'warehouse-zone', warehouseId: 1 },
      { key: 'wh-cost-1', header: 'P — East Cost', kind: 'warehouse-cost', warehouseId: 1 },
      { key: 'wh-zone-2', header: 'P — West Zone', kind: 'warehouse-zone', warehouseId: 2 },
      { key: 'wh-cost-2', header: 'P — West Cost', kind: 'warehouse-cost', warehouseId: 2 },
      { key: 'opt-zone-P', header: 'P (Optimized) Zone', kind: 'opt-zone', providerName: 'P' },
      { key: 'opt-cost-P', header: 'P (Optimized) Cost', kind: 'opt-cost', providerName: 'P' },
      { key: 'opt-winner-P', header: 'P (Optimized) Winning Location', kind: 'opt-winner', providerName: 'P' },
    ],
    rows: [
      {
        orderId: 1,
        orderNumber: 'O1',
        actualWeightLbs: 2.5,
        dims: '5×6×7',
        destZip: '01234',
        state: 'MA',
        billableWeightValue: 3,
        billableWeightUnit: 'lbs',
        warehouseZones: { 1: 4, 2: 5 },
        warehouseCosts: { 1: 500, 2: 600 },
        optZones: { P: 4 },
        optCosts: { P: 500 },
        optWinners: { P: 'East' },
      },
    ],
  }
}

describe('buildPerOrderExport', () => {
  it('column ordering preserved', () => {
    const out = buildPerOrderExport(baseTable())
    expect(out.columnHeaders).toEqual([
      'Order #',
      'Actual Weight (lbs)',
      'Dims (L × W × H)',
      'Dest ZIP',
      'State',
      'Billable Weight',
      'Billable Unit',
      'P — East Zone',
      'P — East Cost',
      'P — West Zone',
      'P — West Cost',
      'P (Optimized) Zone',
      'P (Optimized) Cost',
      'P (Optimized) Winning Location',
    ])
  })

  it('renders a full row with numeric cells for cost/zone and preserved ZIP string', () => {
    const out = buildPerOrderExport(baseTable())
    const row = out.rows[0]
    expect(row[0]).toBe('O1')
    expect(row[3]).toBe('01234')
    expect(row[7]).toBe(4) // zone number
    expect(row[8]).toBe(500) // cost cents (raw)
    expect(row[11]).toBe(4) // opt zone
    expect(row[12]).toBe(500) // opt cost cents
    expect(row[13]).toBe('East') // opt winner
  })

  it('dims empty string when not set', () => {
    const t = baseTable()
    t.rows[0].dims = null
    const out = buildPerOrderExport(t)
    expect(out.rows[0][2]).toBe('')
  })

  it('excluded location column values still populated (auditability) while opt-winner reflects included only', () => {
    // Caller computed optWinners with the included set; excluded location
    // still has warehouseZones/Costs filled in. We trust the input.
    const t = baseTable()
    // Simulate: location 2 excluded — winner can only be East
    t.rows[0].optWinners = { P: 'East' }
    const out = buildPerOrderExport(t)
    expect(out.rows[0][10]).toBe(600) // West cost still present
    expect(out.rows[0][13]).toBe('East')
  })

  it('0-of-M: optimized triple cells empty when no winner recorded', () => {
    const t = baseTable()
    t.rows[0].optZones = {}
    t.rows[0].optCosts = {}
    t.rows[0].optWinners = {}
    const out = buildPerOrderExport(t)
    expect(out.rows[0][11]).toBe(null)
    expect(out.rows[0][12]).toBe(null)
    expect(out.rows[0][13]).toBe('')
  })
})
