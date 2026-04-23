/**
 * Pure derivation of zone-distribution chart data from the OrderResult matrix.
 *
 * In Single-node mode: one row per warehouse.
 * In Optimized mode: one row per provider (multi-location uses winning warehouse
 * zone per order; single-location is just that warehouse). allExcluded providers
 * are omitted entirely.
 *
 * Output is ordered to match the summary table sort (caller provides tableRows).
 */
import { computeProviderOptimized } from '@/lib/engine/optimized'
import type { OrderResult } from '@/types'
import type { MatrixOrder, MatrixWarehouse, TableRow, ViewMode } from './derive-table'

export interface ZoneDistRow {
  key: string
  label: string
  /** zone number (1-8) → order count */
  zones: Record<number, number>
  total: number
}

function matrixEntriesToOrderResults(matrix: MatrixOrder[]): OrderResult[] {
  const out: OrderResult[] = []
  for (const m of matrix) {
    for (const r of m.results) {
      out.push({
        orderId: m.order_id,
        warehouseId: r.warehouse_id,
        zone: r.zone,
        totalCostCents: r.total_cost_cents,
        billableWeightValue: r.billable_weight_value,
        billableWeightUnit: r.billable_weight_unit,
        dimWeightLbs: null,
        rateCardId: 0,
        baseCostCents: r.total_cost_cents,
        surchargeCents: 0,
        calculationNotes: null,
      })
    }
  }
  return out
}

export function deriveZoneDistribution(params: {
  warehouses: MatrixWarehouse[]
  matrix: MatrixOrder[]
  mode: ViewMode
  excludedWarehouseIds: number[]
  tableRows: TableRow[]
}): ZoneDistRow[] {
  const { warehouses, matrix, mode, excludedWarehouseIds, tableRows } = params
  const excludedSet = new Set(excludedWarehouseIds)

  // Build a lookup: warehouseId → per-order zone counts
  const warehouseZones = new Map<number, Record<number, number>>()
  for (const w of warehouses) warehouseZones.set(w.id, {})
  for (const o of matrix) {
    for (const r of o.results) {
      const zmap = warehouseZones.get(r.warehouse_id)
      if (!zmap) continue
      zmap[r.zone] = (zmap[r.zone] ?? 0) + 1
    }
  }

  // Group warehouses by provider for Optimized mode
  const byProvider = new Map<string, MatrixWarehouse[]>()
  for (const w of warehouses) {
    const list = byProvider.get(w.provider_name) ?? []
    list.push(w)
    byProvider.set(w.provider_name, list)
  }

  const orderResults = matrixEntriesToOrderResults(matrix)

  const rows: ZoneDistRow[] = []

  for (const tableRow of tableRows) {
    if (tableRow.kind === 'provider' && tableRow.allExcluded) continue

    if (mode === 'single_node') {
      if (tableRow.kind === 'single') {
        const wid = tableRow.warehouseId
        const zones = warehouseZones.get(wid) ?? {}
        const total = Object.values(zones).reduce((s, n) => s + n, 0)
        rows.push({
          key: tableRow.key,
          label: `${tableRow.providerName} — ${tableRow.locationLabel}`,
          zones,
          total,
        })
      }
      // In single_node mode, provider rows don't exist — tableRows are all 'single'
    } else {
      // Optimized mode
      if (tableRow.kind === 'single') {
        const wid = tableRow.warehouseId
        const zones = warehouseZones.get(wid) ?? {}
        const total = Object.values(zones).reduce((s, n) => s + n, 0)
        rows.push({
          key: tableRow.key,
          label: tableRow.providerName,
          zones,
          total,
        })
      } else {
        // Multi-location provider: zone distribution from winning warehouse per order
        const group = byProvider.get(tableRow.providerName) ?? []
        const providerIds = group.map((w) => w.id)
        const includedIds = providerIds.filter((id) => !excludedSet.has(id))
        if (includedIds.length === 0) continue

        const summary = computeProviderOptimized({
          providerName: tableRow.providerName,
          providerWarehouseIds: providerIds,
          includedWarehouseIds: includedIds,
          orderResults,
        })
        if (!summary) continue

        const zones: Record<number, number> = {}
        for (const w of summary.winners) {
          zones[w.winningZone] = (zones[w.winningZone] ?? 0) + 1
        }
        const total = summary.winners.length
        rows.push({
          key: tableRow.key,
          label: tableRow.providerName,
          zones,
          total,
        })
      }
    }
  }

  return rows
}
