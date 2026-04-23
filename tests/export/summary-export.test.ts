import { describe, it, expect } from 'vitest'
import { buildSummaryExport } from '@/lib/export/summary-export'
import type { TableModel, MatrixWarehouse } from '@/lib/results/derive-table'

function wh(id: number, provider: string, label: string): MatrixWarehouse {
  return { id, provider_name: provider, location_label: label, origin_zip: '00000', origin_zip3: '000' }
}

function singleRow(id: number, provider: string, label: string, cents: number, zone = 4) {
  return {
    kind: 'single' as const,
    key: `wh-${id}`,
    providerName: provider,
    locationLabel: label,
    warehouseId: id,
    avgZone: zone,
    avgCostCents: cents,
  }
}

function providerRow(opts: {
  name: string
  total: number
  included: number[]
  locations: Array<{ id: number; label: string; included: boolean; zone: number; cents: number }>
  avgZone: number
  avgCostCents: number
  allExcluded?: boolean
}) {
  return {
    kind: 'provider' as const,
    key: `provider-${opts.name}`,
    providerName: opts.name,
    totalLocations: opts.total,
    includedWarehouseIds: opts.included,
    avgZone: opts.avgZone,
    avgCostCents: opts.avgCostCents,
    nodeUtilization: {},
    locations: opts.locations.map((l) => ({
      warehouseId: l.id,
      locationLabel: l.label,
      included: l.included,
      avgZone: l.zone,
      avgCostCents: l.cents,
    })),
    allExcluded: opts.allExcluded ?? false,
  }
}

describe('buildSummaryExport — header block', () => {
  const baseModel: TableModel = { rows: [], winnerKey: null }

  it('omits projected period line when projectedOrderCount is null', () => {
    const out = buildSummaryExport({
      analysisName: 'X',
      orderCount: 100,
      mode: 'optimized',
      projectedOrderCount: null,
      projectedPeriod: 'year',
      excludedWarehouseIds: [],
      model: baseModel,
      warehouses: [],
    })
    expect(out.headerLines.some((l) => l.text.startsWith('Projected period'))).toBe(false)
    expect(out.hasProjectedColumn).toBe(false)
  })

  it('includes projected period line when set, formatted for year', () => {
    const out = buildSummaryExport({
      analysisName: 'X',
      orderCount: 100,
      mode: 'optimized',
      projectedOrderCount: 50000,
      projectedPeriod: 'year',
      excludedWarehouseIds: [],
      model: baseModel,
      warehouses: [],
    })
    expect(out.headerLines.some((l) => l.text === 'Projected period: 50,000 orders/year')).toBe(true)
    expect(out.hasProjectedColumn).toBe(true)
    expect(out.projectedColumnLabel).toBe('Projected/Yr')
  })

  it('includes projected period line when set, formatted for month', () => {
    const out = buildSummaryExport({
      analysisName: 'X',
      orderCount: 100,
      mode: 'optimized',
      projectedOrderCount: 4000,
      projectedPeriod: 'month',
      excludedWarehouseIds: [],
      model: baseModel,
      warehouses: [],
    })
    expect(out.headerLines.some((l) => l.text === 'Projected period: 4,000 orders/month')).toBe(true)
    expect(out.projectedColumnLabel).toBe('Projected/Mo')
  })

  it('omits Network Configurations when no multi-node providers', () => {
    const out = buildSummaryExport({
      analysisName: 'X',
      orderCount: 100,
      mode: 'optimized',
      projectedOrderCount: null,
      projectedPeriod: 'year',
      excludedWarehouseIds: [],
      model: baseModel,
      warehouses: [wh(1, 'A', 'East')],
    })
    expect(out.headerLines.some((l) => l.text === 'Network configurations:')).toBe(false)
  })

  it('omits Network Configurations in Single-node mode even with multi-node providers', () => {
    const out = buildSummaryExport({
      analysisName: 'X',
      orderCount: 100,
      mode: 'single_node',
      projectedOrderCount: null,
      projectedPeriod: 'year',
      excludedWarehouseIds: [],
      model: baseModel,
      warehouses: [wh(1, 'A', 'East'), wh(2, 'A', 'West')],
    })
    expect(out.headerLines.some((l) => l.text === 'Network configurations:')).toBe(false)
  })

  it('includes Network Configurations in Optimized mode, with Active/Excluded lines', () => {
    const out = buildSummaryExport({
      analysisName: 'X',
      orderCount: 100,
      mode: 'optimized',
      projectedOrderCount: null,
      projectedPeriod: 'year',
      excludedWarehouseIds: [2],
      model: baseModel,
      warehouses: [wh(1, 'A', 'East'), wh(2, 'A', 'West'), wh(3, 'A', 'Central')],
    })
    const texts = out.headerLines.map((l) => l.text)
    expect(texts).toContain('Network configurations:')
    expect(texts).toContain('A: 2 of 3 locations active')
    expect(texts.find((t) => t.startsWith('  Active:'))).toBe('  Active: East, Central')
    expect(texts.find((t) => t.startsWith('  Excluded:'))).toBe('  Excluded: West')
  })

  it('omits Excluded line when no locations excluded', () => {
    const out = buildSummaryExport({
      analysisName: 'X',
      orderCount: 100,
      mode: 'optimized',
      projectedOrderCount: null,
      projectedPeriod: 'year',
      excludedWarehouseIds: [],
      model: baseModel,
      warehouses: [wh(1, 'A', 'East'), wh(2, 'A', 'West')],
    })
    expect(out.headerLines.some((l) => l.text.startsWith('  Excluded:'))).toBe(false)
    expect(out.headerLines.some((l) => l.text === 'A: 2 of 2 locations active')).toBe(true)
  })

  it('handles 0-of-M provider: line present with "0 of M locations active"', () => {
    const out = buildSummaryExport({
      analysisName: 'X',
      orderCount: 100,
      mode: 'optimized',
      projectedOrderCount: null,
      projectedPeriod: 'year',
      excludedWarehouseIds: [1, 2],
      model: baseModel,
      warehouses: [wh(1, 'A', 'East'), wh(2, 'A', 'West')],
    })
    expect(out.headerLines.some((l) => l.text === 'A: 0 of 2 locations active')).toBe(true)
  })
})

describe('buildSummaryExport — rows', () => {
  it('Optimized: one row per provider, excluded-location rows omitted, 0-of-M omitted', () => {
    const model: TableModel = {
      rows: [
        singleRow(1, 'Solo', 'Only', 500),
        providerRow({
          name: 'Multi',
          total: 3,
          included: [2, 3],
          locations: [
            { id: 2, label: 'East', included: true, zone: 4, cents: 400 },
            { id: 3, label: 'West', included: true, zone: 5, cents: 600 },
            { id: 4, label: 'Central', included: false, zone: 5, cents: 700 },
          ],
          avgZone: 4.5,
          avgCostCents: 500,
        }),
        providerRow({
          name: 'Dead',
          total: 2,
          included: [],
          locations: [
            { id: 5, label: 'A', included: false, zone: 0, cents: 0 },
            { id: 6, label: 'B', included: false, zone: 0, cents: 0 },
          ],
          avgZone: 0,
          avgCostCents: 0,
          allExcluded: true,
        }),
      ],
      winnerKey: 'wh-1',
    }
    const out = buildSummaryExport({
      analysisName: 'X',
      orderCount: 100,
      mode: 'optimized',
      projectedOrderCount: null,
      projectedPeriod: 'year',
      excludedWarehouseIds: [4, 5, 6],
      model,
      warehouses: [],
    })
    expect(out.rows).toHaveLength(2)
    expect(out.rows[0].provider).toBe('Solo')
    expect(out.rows[1].provider).toBe('Multi')
  })

  it('Single-node: one row per warehouse from model rows', () => {
    const model: TableModel = {
      rows: [singleRow(1, 'A', 'East', 300), singleRow(2, 'A', 'West', 500)],
      winnerKey: 'wh-1',
    }
    const out = buildSummaryExport({
      analysisName: 'X',
      orderCount: 100,
      mode: 'single_node',
      projectedOrderCount: null,
      projectedPeriod: 'year',
      excludedWarehouseIds: [],
      model,
      warehouses: [],
    })
    expect(out.rows).toHaveLength(2)
    expect(out.rows.every((r) => r.networkConfig === 'Single-node view')).toBe(true)
  })

  it('Network Config: Single / All N / N of M: ...', () => {
    const model: TableModel = {
      rows: [
        singleRow(1, 'Solo', 'Only', 500),
        providerRow({
          name: 'Full',
          total: 2,
          included: [2, 3],
          locations: [
            { id: 2, label: 'East', included: true, zone: 4, cents: 400 },
            { id: 3, label: 'West', included: true, zone: 5, cents: 600 },
          ],
          avgZone: 4.5,
          avgCostCents: 500,
        }),
        providerRow({
          name: 'Partial',
          total: 3,
          included: [4, 5],
          locations: [
            { id: 4, label: 'North', included: true, zone: 3, cents: 300 },
            { id: 5, label: 'South', included: true, zone: 4, cents: 500 },
            { id: 6, label: 'Gone', included: false, zone: 0, cents: 0 },
          ],
          avgZone: 3.5,
          avgCostCents: 400,
        }),
      ],
      winnerKey: 'wh-1',
    }
    const out = buildSummaryExport({
      analysisName: 'X',
      orderCount: 100,
      mode: 'optimized',
      projectedOrderCount: null,
      projectedPeriod: 'year',
      excludedWarehouseIds: [6],
      model,
      warehouses: [],
    })
    expect(out.rows[0].networkConfig).toBe('Single')
    expect(out.rows[1].networkConfig).toBe('All 2 locations')
    expect(out.rows[2].networkConfig).toBe('2 of 3: North, South')
  })

  it('Projected Period Cost column present when projectedOrderCount > 0', () => {
    const model: TableModel = {
      rows: [singleRow(1, 'A', 'East', 500)],
      winnerKey: 'wh-1',
    }
    const out = buildSummaryExport({
      analysisName: 'X',
      orderCount: 100,
      mode: 'single_node',
      projectedOrderCount: 1000,
      projectedPeriod: 'year',
      excludedWarehouseIds: [],
      model,
      warehouses: [],
    })
    expect(out.hasProjectedColumn).toBe(true)
    expect(out.columnHeaders.includes('Projected/Yr')).toBe(true)
    expect(out.rows[0].projectedPeriodCostCents).toBe(500 * 1000)
  })

  it('Projected Period Cost column absent when projectedOrderCount is null/0', () => {
    const model: TableModel = {
      rows: [singleRow(1, 'A', 'East', 500)],
      winnerKey: 'wh-1',
    }
    const out = buildSummaryExport({
      analysisName: 'X',
      orderCount: 100,
      mode: 'single_node',
      projectedOrderCount: 0,
      projectedPeriod: 'year',
      excludedWarehouseIds: [],
      model,
      warehouses: [],
    })
    expect(out.hasProjectedColumn).toBe(false)
    expect(out.columnHeaders.includes('Projected/Yr')).toBe(false)
    expect(out.rows[0].projectedPeriodCostCents).toBe(null)
  })
})
