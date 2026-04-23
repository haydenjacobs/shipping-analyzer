import { describe, it, expect } from 'vitest'
import {
  buildPerOrderCsv,
  buildSummaryCsv,
  escapeCsvCell,
} from '@/lib/export/csv-writer'
import { buildSummaryExport } from '@/lib/export/summary-export'
import { buildPerOrderExport } from '@/lib/export/per-order-export'
import type { TableModel } from '@/lib/results/derive-table'
import type { PerOrderTableResult } from '@/lib/results/derive-per-order-table'

describe('escapeCsvCell', () => {
  it('leaves simple cells unquoted', () => {
    expect(escapeCsvCell('hello')).toBe('hello')
    expect(escapeCsvCell(12)).toBe('12')
  })

  it('quotes commas', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"')
  })

  it('escapes double quotes by doubling', () => {
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""')
  })

  it('quotes newlines', () => {
    expect(escapeCsvCell('a\nb')).toBe('"a\nb"')
    expect(escapeCsvCell('a\r\nb')).toBe('"a\r\nb"')
  })

  it('quotes leading-zero numeric strings to preserve them', () => {
    expect(escapeCsvCell('01234')).toBe('"01234"')
  })

  it('renders null/undefined as empty', () => {
    expect(escapeCsvCell(null)).toBe('')
    expect(escapeCsvCell(undefined)).toBe('')
  })
})

describe('buildSummaryCsv', () => {
  it('renders header lines in column A, blank row, then headers + data', () => {
    const model: TableModel = {
      rows: [
        {
          kind: 'single',
          key: 'wh-1',
          providerName: 'A',
          locationLabel: 'East',
          warehouseId: 1,
          avgZone: 4.23,
          avgCostCents: 500,
        },
      ],
      winnerKey: 'wh-1',
    }
    const summary = buildSummaryExport({
      analysisName: 'Test',
      orderCount: 10,
      mode: 'single_node',
      projectedOrderCount: 1000,
      projectedPeriod: 'year',
      excludedWarehouseIds: [],
      model,
      warehouses: [],
    })
    const csv = buildSummaryCsv(summary)
    const lines = csv.split('\n')
    expect(lines[0]).toBe('Analysis name: Test')
    // blank row present somewhere before column headers
    const blankIdx = lines.indexOf('')
    expect(blankIdx).toBeGreaterThan(0)
    const headerIdx = lines.indexOf('3PL,Location(s),Network Config,Avg Zone,Avg Cost,Projected/Yr')
    expect(headerIdx).toBeGreaterThan(blankIdx)
    expect(lines[headerIdx + 1]).toBe('A,East,Single-node view,4.2,$5.00,$5000.00')
  })
})

describe('buildPerOrderCsv', () => {
  const table: PerOrderTableResult = {
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

  it('preserves leading zeros in ZIP by quoting, formats cost column as currency', () => {
    const per = buildPerOrderExport(table)
    const csv = buildPerOrderCsv(per)
    const lines = csv.split('\n')
    expect(lines[0]).toBe('Order #,Dest ZIP,P — East Cost')
    expect(lines[1]).toBe('O1,"01234",$5.00')
  })
})
