/**
 * Pure derivation of the Results View table model from:
 *   - the OrderResult matrix (fetched once from GET /api/analyses/[id]/results)
 *   - the list of warehouses in the analysis
 *   - the current view state (mode + excluded warehouse IDs)
 *
 * No React, no DOM. The Results View components consume this output directly.
 *
 * Why a pure function: Step 7 optimization runs entirely client-side. Keeping
 * the derivation pure (same inputs → same outputs) means we can unit-test it
 * without React Testing Library, keeps the components thin, and makes re-render
 * memoization trivial.
 */
import { computeProviderOptimized } from '@/lib/engine/optimized'
import type { OrderResult } from '@/types'

export interface MatrixWarehouse {
  id: number
  provider_name: string
  location_label: string
  origin_zip: string
  origin_zip3: string
}

export interface MatrixOrder {
  order_id: number
  results: Array<{
    warehouse_id: number
    zone: number
    total_cost_cents: number
    billable_weight_value: number
    billable_weight_unit: 'oz' | 'lbs'
  }>
}

export interface OrderDetail {
  id: number
  order_number: string
  actual_weight_lbs: number
  height: number | null
  width: number | null
  length: number | null
  dest_zip: string
  state: string | null
}

export type ViewMode = 'optimized' | 'single_node'

/** A row in the summary table. */
export type TableRow =
  | {
      kind: 'single'
      /** Stable row key. */
      key: string
      providerName: string
      locationLabel: string
      avgZone: number
      avgCostCents: number
      /** Used for winner highlight. */
      warehouseId: number
    }
  | {
      kind: 'provider'
      key: string
      providerName: string
      /** Total warehouses in the provider group (M). */
      totalLocations: number
      /** Currently-included warehouse ids (subset of the group). */
      includedWarehouseIds: number[]
      /** Aggregates across included locations. */
      avgZone: number
      avgCostCents: number
      /** warehouseId → fraction of winning orders (0..1); excluded = 0. */
      nodeUtilization: Record<number, number>
      /** All of this provider's warehouses, with per-location aggregates. */
      locations: Array<{
        warehouseId: number
        locationLabel: string
        included: boolean
        avgZone: number
        avgCostCents: number
      }>
      /**
       * True when all locations are unchecked (0 of M). These rows do NOT appear
       * in the main sort; the table puts them at the bottom so the user can
       * re-check a location.
       */
      allExcluded: boolean
    }

export interface TableModel {
  rows: TableRow[]
  /** The row key of the cheapest row overall (excluding allExcluded rows). */
  winnerKey: string | null
}

/** Flatten the matrix into the OrderResult[] shape computeProviderOptimized expects. */
function matrixToOrderResults(matrix: MatrixOrder[]): OrderResult[] {
  const out: OrderResult[] = []
  for (const m of matrix) {
    for (const r of m.results) {
      // Only the four fields used by computeProviderOptimized matter; stub the rest.
      out.push({
        orderId: m.order_id,
        warehouseId: r.warehouse_id,
        zone: r.zone,
        totalCostCents: r.total_cost_cents,
        billableWeightValue: 0,
        billableWeightUnit: 'lbs',
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

/** Per-warehouse (single-node) aggregates derived straight from the matrix. */
function computeWarehouseAggregates(
  matrix: MatrixOrder[],
): Map<number, { avgZone: number; avgCostCents: number }> {
  const accum = new Map<number, { zoneSum: number; costSum: number; n: number }>()
  for (const o of matrix) {
    for (const r of o.results) {
      const a = accum.get(r.warehouse_id) ?? { zoneSum: 0, costSum: 0, n: 0 }
      a.zoneSum += r.zone
      a.costSum += r.total_cost_cents
      a.n += 1
      accum.set(r.warehouse_id, a)
    }
  }
  const out = new Map<number, { avgZone: number; avgCostCents: number }>()
  for (const [whId, a] of accum) {
    out.set(whId, {
      avgZone: a.n > 0 ? a.zoneSum / a.n : 0,
      avgCostCents: a.n > 0 ? Math.round(a.costSum / a.n) : 0,
    })
  }
  return out
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

export function deriveTableModel(params: {
  warehouses: MatrixWarehouse[]
  matrix: MatrixOrder[]
  mode: ViewMode
  excludedWarehouseIds: number[]
}): TableModel {
  const { warehouses, matrix, mode, excludedWarehouseIds } = params
  const excludedSet = new Set(excludedWarehouseIds)
  const perWh = computeWarehouseAggregates(matrix)

  const rows: TableRow[] = []
  const bottomRows: TableRow[] = []

  if (mode === 'single_node') {
    for (const w of warehouses) {
      const a = perWh.get(w.id) ?? { avgZone: 0, avgCostCents: 0 }
      rows.push({
        kind: 'single',
        key: `wh-${w.id}`,
        providerName: w.provider_name,
        locationLabel: w.location_label,
        warehouseId: w.id,
        avgZone: a.avgZone,
        avgCostCents: a.avgCostCents,
      })
    }
  } else {
    // Optimized mode. Group by provider.
    const byProvider = groupWarehousesByProvider(warehouses)
    const orderResults = matrixToOrderResults(matrix)

    for (const [providerName, group] of byProvider) {
      // Single-location provider renders as a flat row even in Optimized mode.
      if (group.length === 1) {
        const w = group[0]
        const a = perWh.get(w.id) ?? { avgZone: 0, avgCostCents: 0 }
        rows.push({
          kind: 'single',
          key: `wh-${w.id}`,
          providerName: w.provider_name,
          locationLabel: w.location_label,
          warehouseId: w.id,
          avgZone: a.avgZone,
          avgCostCents: a.avgCostCents,
        })
        continue
      }

      const providerIds = group.map((w) => w.id)
      const includedIds = providerIds.filter((id) => !excludedSet.has(id))
      const allExcluded = includedIds.length === 0

      // Per-location aggregates always shown in the expanded detail regardless of included/excluded.
      const locations = group.map((w) => {
        const a = perWh.get(w.id) ?? { avgZone: 0, avgCostCents: 0 }
        return {
          warehouseId: w.id,
          locationLabel: w.location_label,
          included: !excludedSet.has(w.id),
          avgZone: a.avgZone,
          avgCostCents: a.avgCostCents,
        }
      })

      if (allExcluded) {
        bottomRows.push({
          kind: 'provider',
          key: `provider-${providerName}`,
          providerName,
          totalLocations: group.length,
          includedWarehouseIds: [],
          avgZone: 0,
          avgCostCents: 0,
          nodeUtilization: Object.fromEntries(providerIds.map((id) => [id, 0])),
          locations,
          allExcluded: true,
        })
        continue
      }

      const summary = computeProviderOptimized({
        providerName,
        providerWarehouseIds: providerIds,
        includedWarehouseIds: includedIds,
        orderResults,
      })!

      rows.push({
        kind: 'provider',
        key: `provider-${providerName}`,
        providerName,
        totalLocations: group.length,
        includedWarehouseIds: includedIds,
        avgZone: summary.avgZone,
        avgCostCents: summary.avgCostCents,
        nodeUtilization: summary.nodeUtilization,
        locations,
        allExcluded: false,
      })
    }
  }

  // Sort primary rows by avg cost asc; tiebreak by provider+label alpha.
  rows.sort((a, b) => {
    if (a.avgCostCents !== b.avgCostCents) return a.avgCostCents - b.avgCostCents
    const la = a.kind === 'single' ? `${a.providerName} ${a.locationLabel}` : a.providerName
    const lb = b.kind === 'single' ? `${b.providerName} ${b.locationLabel}` : b.providerName
    return la.localeCompare(lb)
  })

  const winnerKey = rows.length > 0 ? rows[0].key : null

  return { rows: [...rows, ...bottomRows], winnerKey }
}
