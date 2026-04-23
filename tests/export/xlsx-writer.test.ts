import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { buildWorkbook } from '@/lib/export/xlsx-writer'
import { buildSummaryExport } from '@/lib/export/summary-export'
import { buildPerOrderExport } from '@/lib/export/per-order-export'
import type { TableModel } from '@/lib/results/derive-table'
import type { PerOrderTableResult } from '@/lib/results/derive-per-order-table'

function makeSummary() {
  const model: TableModel = {
    rows: [
      {
        kind: 'single',
        key: 'wh-1',
        providerName: 'A',
        locationLabel: 'East',
        warehouseId: 1,
        avgZone: 4.2,
        avgCostCents: 500,
      },
    ],
    winnerKey: 'wh-1',
  }
  return buildSummaryExport({
    analysisName: 'Test',
    orderCount: 10,
    mode: 'single_node',
    projectedOrderCount: null,
    projectedPeriod: 'year',
    excludedWarehouseIds: [],
    model,
    warehouses: [],
  })
}

function makePerOrder() {
  const t: PerOrderTableResult = {
    columns: [
      { key: 'order-number', header: 'Order #', kind: 'order-number' },
      { key: 'dest-zip', header: 'Dest ZIP', kind: 'dest-zip' },
      { key: 'wh-cost-1', header: 'P — East Cost', kind: 'warehouse-cost', warehouseId: 1 },
    ],
    rows: [
      {
        orderId: 1,
        orderNumber: 'O1',
        actualWeightLbs: 0,
        dims: null,
        destZip: '01234',
        state: null,
        billableWeightValue: null,
        billableWeightUnit: null,
        warehouseZones: {},
        warehouseCosts: { 1: 500 },
        optZones: {},
        optCosts: {},
        optWinners: {},
      },
    ],
  }
  return buildPerOrderExport(t)
}

describe('buildWorkbook', () => {
  it('has exactly two sheets named Summary and Per-Order Breakdown', () => {
    const wb = buildWorkbook({ summary: makeSummary(), perOrder: makePerOrder() })
    expect(wb.SheetNames).toEqual(['Summary', 'Per-Order Breakdown'])
  })

  it('Summary sheet: header lines above table, currency format on Avg Cost', () => {
    const wb = buildWorkbook({ summary: makeSummary(), perOrder: makePerOrder() })
    const ws = wb.Sheets['Summary']
    expect((ws['A1'] as XLSX.CellObject).v).toBe('Analysis name: Test')
    // Header has 3 lines (name, count, mode), then blank row (row 4), then column headers row 5, data row 6.
    const dataRow = 6 // 1-indexed
    const avgCostCell = ws[`E${dataRow}`] as XLSX.CellObject
    expect(avgCostCell.v).toBe(5) // dollars
    expect(avgCostCell.z).toBe('"$"#,##0.00')
  })

  it('Per-Order sheet: currency format on cost columns, text format on ZIP', () => {
    const wb = buildWorkbook({ summary: makeSummary(), perOrder: makePerOrder() })
    const ws = wb.Sheets['Per-Order Breakdown']
    // Column A = Order #, B = Dest ZIP, C = P — East Cost
    const zip = ws['B2'] as XLSX.CellObject
    expect(zip.z).toBe('@')
    expect(zip.t).toBe('s')
    expect(zip.v).toBe('01234')

    const cost = ws['C2'] as XLSX.CellObject
    expect(cost.z).toBe('"$"#,##0.00')
  })
})
