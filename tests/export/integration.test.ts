/**
 * Integration: end-to-end pipeline from derivation → summary/per-order export
 * → CSV + XLSX output. Validates structural properties of both artifacts.
 */
import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { deriveTableModel, type MatrixOrder, type MatrixWarehouse, type OrderDetail } from '@/lib/results/derive-table'
import { derivePerOrderTable } from '@/lib/results/derive-per-order-table'
import { buildSummaryExport } from '@/lib/export/summary-export'
import { buildPerOrderExport } from '@/lib/export/per-order-export'
import { buildSummaryCsv, buildPerOrderCsv } from '@/lib/export/csv-writer'
import { buildWorkbook } from '@/lib/export/xlsx-writer'

function wh(id: number, provider: string, label: string): MatrixWarehouse {
  return { id, provider_name: provider, location_label: label, origin_zip: '00000', origin_zip3: '000' }
}

describe('Export pipeline integration', () => {
  // Fixture: Solo (single-location), Multi (3 locations, one excluded), Dead (2 locations both excluded).
  const warehouses = [
    wh(1, 'Solo', 'HQ'),
    wh(2, 'Multi', 'East'),
    wh(3, 'Multi', 'West'),
    wh(4, 'Multi', 'Central'),
    wh(5, 'Dead', 'A'),
    wh(6, 'Dead', 'B'),
  ]
  const matrix: MatrixOrder[] = [
    {
      order_id: 101,
      results: [
        { warehouse_id: 1, zone: 4, total_cost_cents: 500, billable_weight_value: 2, billable_weight_unit: 'lbs' },
        { warehouse_id: 2, zone: 3, total_cost_cents: 400, billable_weight_value: 2, billable_weight_unit: 'lbs' },
        { warehouse_id: 3, zone: 5, total_cost_cents: 600, billable_weight_value: 2, billable_weight_unit: 'lbs' },
        { warehouse_id: 4, zone: 6, total_cost_cents: 700, billable_weight_value: 2, billable_weight_unit: 'lbs' },
        { warehouse_id: 5, zone: 2, total_cost_cents: 300, billable_weight_value: 2, billable_weight_unit: 'lbs' },
        { warehouse_id: 6, zone: 3, total_cost_cents: 350, billable_weight_value: 2, billable_weight_unit: 'lbs' },
      ],
    },
    {
      order_id: 102,
      results: [
        { warehouse_id: 1, zone: 5, total_cost_cents: 550, billable_weight_value: 3, billable_weight_unit: 'lbs' },
        { warehouse_id: 2, zone: 4, total_cost_cents: 420, billable_weight_value: 3, billable_weight_unit: 'lbs' },
        { warehouse_id: 3, zone: 5, total_cost_cents: 650, billable_weight_value: 3, billable_weight_unit: 'lbs' },
        { warehouse_id: 4, zone: 6, total_cost_cents: 750, billable_weight_value: 3, billable_weight_unit: 'lbs' },
        { warehouse_id: 5, zone: 3, total_cost_cents: 310, billable_weight_value: 3, billable_weight_unit: 'lbs' },
        { warehouse_id: 6, zone: 4, total_cost_cents: 360, billable_weight_value: 3, billable_weight_unit: 'lbs' },
      ],
    },
  ]
  const orders: OrderDetail[] = [
    { id: 101, order_number: 'O101', actual_weight_lbs: 1.5, height: 5, width: 6, length: 7, dest_zip: '01234', state: 'MA' },
    { id: 102, order_number: 'O102', actual_weight_lbs: 2.5, height: null, width: null, length: null, dest_zip: '90210', state: 'CA' },
  ]
  const excludedWarehouseIds = [4, 5, 6]

  const model = deriveTableModel({ warehouses, matrix, mode: 'optimized', excludedWarehouseIds })
  const perOrderTable = derivePerOrderTable({ warehouses, matrix, orders, excludedWarehouseIds, tableRows: model.rows })

  const summary = buildSummaryExport({
    analysisName: 'Client X',
    orderCount: orders.length,
    mode: 'optimized',
    projectedOrderCount: 50000,
    projectedPeriod: 'year',
    excludedWarehouseIds,
    model,
    warehouses,
  })
  const perOrder = buildPerOrderExport(perOrderTable)

  it('summary CSV parses back with expected structure', () => {
    const csv = buildSummaryCsv(summary)
    const lines = csv.split('\n')
    expect(lines[0]).toBe('Analysis name: Client X')
    expect(lines).toContain('Network configurations:')
    expect(lines).toContain('Multi: 2 of 3 locations active')
    expect(lines).toContain('Dead: 0 of 2 locations active')
    // Projected column in header row
    const headerRow = lines.find((l) => l.startsWith('3PL,'))!
    expect(headerRow).toContain('Projected/Yr')
    // Main table rows: Solo + Multi (Dead omitted)
    const providerRowCount = lines.filter((l) => l.startsWith('Solo,') || l.startsWith('Multi,')).length
    expect(providerRowCount).toBe(2)
    expect(lines.some((l) => l.startsWith('Dead,'))).toBe(false)
  })

  it('per-order CSV includes all providers including 0-of-M (auditability)', () => {
    const csv = buildPerOrderCsv(perOrder)
    const [header, ...rows] = csv.split('\n')
    expect(header).toContain('Solo — HQ Cost')
    expect(header).toContain('Multi — East Cost')
    expect(header).toContain('Multi — Central Cost')
    expect(header).toContain('Multi (Optimized) Winning Location')
    expect(header).toContain('Dead — A Cost')
    // Dead should NOT have Optimized columns — 0-of-M
    expect(header).not.toContain('Dead (Optimized)')
    expect(rows).toHaveLength(2)
    // ZIP codes preserved with quotes
    expect(rows[0]).toContain('"01234"')
  })

  it('xlsx has Summary + Per-Order Breakdown tabs with currency cells', () => {
    const wb = buildWorkbook({ summary, perOrder })
    expect(wb.SheetNames).toEqual(['Summary', 'Per-Order Breakdown'])
    const summaryWs = wb.Sheets['Summary']
    expect((summaryWs['A1'] as XLSX.CellObject).v).toBe('Analysis name: Client X')
  })
})
