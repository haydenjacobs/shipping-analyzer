/**
 * Pure data-shaping layer for the Summary export (CSV and Excel share this).
 *
 * Consumers (csv-writer, xlsx-writer) render the returned structure into their
 * respective formats. Keeping this file free of format-specific concerns makes
 * the shaping logic straightforward to unit-test.
 */
import type { TableModel, TableRow, ViewMode, MatrixWarehouse } from '@/lib/results/derive-table'

export interface SummaryHeaderLine {
  /** Left-aligned text placed in column A. Blank cells follow in other columns. */
  text: string
}

export type ProjectedPeriod = 'month' | 'year'

export interface SummaryExportInput {
  analysisName: string
  orderCount: number
  mode: ViewMode
  projectedOrderCount: number | null
  projectedPeriod: ProjectedPeriod
  excludedWarehouseIds: number[]
  model: TableModel
  warehouses: MatrixWarehouse[]
}

export interface SummaryRow {
  provider: string
  locations: string
  networkConfig: string
  avgZone: number
  avgCostCents: number
  /** Populated only when projectedOrderCount is set and > 0. */
  projectedPeriodCostCents: number | null
}

export interface SummaryExport {
  headerLines: SummaryHeaderLine[]
  /** Column headers for the data table. Includes "Projected/Yr" or "Projected/Mo" only when projected set. */
  columnHeaders: string[]
  rows: SummaryRow[]
  /** True when Projected Period Cost column should be emitted. */
  hasProjectedColumn: boolean
  projectedColumnLabel: string | null
}

const LOCATION_LIST_THRESHOLD = 3

export function buildSummaryExport(input: SummaryExportInput): SummaryExport {
  const {
    analysisName,
    orderCount,
    mode,
    projectedOrderCount,
    projectedPeriod,
    excludedWarehouseIds,
    model,
    warehouses,
  } = input

  const hasProjected = projectedOrderCount !== null && projectedOrderCount > 0
  const projectedLabel = hasProjected
    ? projectedPeriod === 'month'
      ? 'Projected/Mo'
      : 'Projected/Yr'
    : null

  const headerLines: SummaryHeaderLine[] = []
  headerLines.push({ text: `Analysis name: ${analysisName}` })
  headerLines.push({ text: `Orders analyzed: ${orderCount.toLocaleString()}` })
  headerLines.push({
    text: `View mode: ${mode === 'optimized' ? 'Optimized' : 'Single-node'}`,
  })
  if (hasProjected) {
    headerLines.push({
      text: `Projected period: ${projectedOrderCount!.toLocaleString()} orders/${projectedPeriod}`,
    })
  }

  // Network Configurations — only in Optimized mode, only if multi-node providers exist.
  if (mode === 'optimized') {
    const providerGroups = groupWarehousesByProvider(warehouses)
    const multiNodeProviders = [...providerGroups.entries()].filter(([, g]) => g.length > 1)

    if (multiNodeProviders.length > 0) {
      headerLines.push({ text: 'Network configurations:' })
      const excludedSet = new Set(excludedWarehouseIds)
      for (const [providerName, group] of multiNodeProviders) {
        const active = group.filter((w) => !excludedSet.has(w.id))
        const excluded = group.filter((w) => excludedSet.has(w.id))
        headerLines.push({
          text: `${providerName}: ${active.length} of ${group.length} locations active`,
        })
        headerLines.push({
          text: `  Active: ${active.map((w) => w.location_label).join(', ')}`,
        })
        if (excluded.length > 0) {
          headerLines.push({
            text: `  Excluded: ${excluded.map((w) => w.location_label).join(', ')}`,
          })
        }
      }
    }
  }

  // Build rows. In Optimized mode, 0-of-M provider rows are omitted from the main
  // summary table (matches Results View behavior); their presence is recorded in
  // the Network Configurations header block above.
  const rows: SummaryRow[] = []
  for (const row of model.rows) {
    if (row.kind === 'provider' && row.allExcluded) continue
    rows.push(buildRow(row, mode, hasProjected, projectedOrderCount))
  }

  const columnHeaders = ['3PL', 'Location(s)', 'Network Config', 'Avg Zone', 'Avg Cost']
  if (hasProjected && projectedLabel) columnHeaders.push(projectedLabel)

  return {
    headerLines,
    columnHeaders,
    rows,
    hasProjectedColumn: hasProjected,
    projectedColumnLabel: projectedLabel,
  }
}

function buildRow(
  row: TableRow,
  mode: ViewMode,
  hasProjected: boolean,
  projectedOrderCount: number | null,
): SummaryRow {
  const projectedCents = hasProjected && projectedOrderCount
    ? Math.round(row.avgCostCents * projectedOrderCount)
    : null

  if (row.kind === 'single') {
    return {
      provider: row.providerName,
      locations: row.locationLabel,
      networkConfig: mode === 'single_node' ? 'Single-node view' : 'Single',
      avgZone: row.avgZone,
      avgCostCents: row.avgCostCents,
      projectedPeriodCostCents: projectedCents,
    }
  }

  // provider row (Optimized mode multi-node)
  const total = row.totalLocations
  const included = row.includedWarehouseIds.length
  const includedLabels = row.locations
    .filter((l) => l.included)
    .map((l) => l.locationLabel)

  const locationsCell =
    includedLabels.length <= LOCATION_LIST_THRESHOLD
      ? includedLabels.join(', ')
      : `${includedLabels.length} locations`

  let networkConfig: string
  if (mode === 'single_node') {
    networkConfig = 'Single-node view'
  } else if (included === total) {
    networkConfig = `All ${total} locations`
  } else {
    networkConfig = `${included} of ${total}: ${includedLabels.join(', ')}`
  }

  return {
    provider: row.providerName,
    locations: locationsCell,
    networkConfig,
    avgZone: row.avgZone,
    avgCostCents: row.avgCostCents,
    projectedPeriodCostCents: projectedCents,
  }
}

function groupWarehousesByProvider(
  warehouses: MatrixWarehouse[],
): Map<string, MatrixWarehouse[]> {
  const map = new Map<string, MatrixWarehouse[]>()
  for (const w of warehouses) {
    const list = map.get(w.provider_name) ?? []
    list.push(w)
    map.set(w.provider_name, list)
  }
  return map
}
