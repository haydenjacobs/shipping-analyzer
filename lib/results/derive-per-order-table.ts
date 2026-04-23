/**
 * Pure derivation of the per-order breakdown table.
 *
 * Produces column definitions (in display order) and row data for the Detailed
 * Breakdown component. The caller handles pagination/slicing.
 *
 * Column order:
 *   1. Order-level constant columns (Order #, Actual Weight, Dims, Dest ZIP, State,
 *      Billable Weight, Billable Unit)
 *   2. Per-provider groups in summary-table sort order (same as tableRows):
 *      - Single-location: [zone, cost]
 *      - Multi-location: [loc1 zone, loc1 cost, ... locN zone, locN cost,
 *                         opt zone, opt cost, opt winner]
 *
 * Excluded locations still appear as columns (Zone/Cost always populated) but
 * will never appear as the Winning Location in an optimized column.
 */
import { computeProviderOptimized } from '@/lib/engine/optimized'
import type { OrderResult } from '@/types'
import type { MatrixOrder, MatrixWarehouse, OrderDetail, TableRow } from './derive-table'

export type ColKind =
  | 'order-number'
  | 'actual-weight'
  | 'dims'
  | 'dest-zip'
  | 'state'
  | 'billable-weight'
  | 'billable-unit'
  | 'warehouse-zone'
  | 'warehouse-cost'
  | 'opt-zone'
  | 'opt-cost'
  | 'opt-winner'

export interface PerOrderCol {
  key: string
  header: string
  kind: ColKind
  /** Present for warehouse-zone, warehouse-cost */
  warehouseId?: number
  /** Present for opt-* columns */
  providerName?: string
}

export interface PerOrderRow {
  orderId: number
  orderNumber: string
  actualWeightLbs: number
  dims: string | null
  destZip: string
  state: string | null
  /** From the first warehouse result (used for the constant Billable Weight/Unit columns). */
  billableWeightValue: number | null
  billableWeightUnit: 'oz' | 'lbs' | null
  /** warehouseId → zone */
  warehouseZones: Record<number, number>
  /** warehouseId → total_cost_cents */
  warehouseCosts: Record<number, number>
  /** providerName → winning zone (among included warehouses) */
  optZones: Record<string, number>
  /** providerName → winning cost cents (among included warehouses) */
  optCosts: Record<string, number>
  /** providerName → winning location_label */
  optWinners: Record<string, string>
}

export interface PerOrderTableResult {
  columns: PerOrderCol[]
  rows: PerOrderRow[]
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

export function derivePerOrderTable(params: {
  warehouses: MatrixWarehouse[]
  matrix: MatrixOrder[]
  orders: OrderDetail[]
  excludedWarehouseIds: number[]
  tableRows: TableRow[]
}): PerOrderTableResult {
  const { warehouses, matrix, orders, excludedWarehouseIds, tableRows } = params
  const excludedSet = new Set(excludedWarehouseIds)

  const whById = new Map(warehouses.map((w) => [w.id, w]))

  // Group warehouses by provider name for optimized column computation
  const byProvider = new Map<string, MatrixWarehouse[]>()
  for (const w of warehouses) {
    const list = byProvider.get(w.provider_name) ?? []
    list.push(w)
    byProvider.set(w.provider_name, list)
  }

  // ─── Build columns ──────────────────────────────────────────────────────────
  const columns: PerOrderCol[] = [
    { key: 'order-number', header: 'Order #', kind: 'order-number' },
    { key: 'actual-weight', header: 'Actual Weight (lbs)', kind: 'actual-weight' },
    { key: 'dims', header: 'Dims (L × W × H)', kind: 'dims' },
    { key: 'dest-zip', header: 'Dest ZIP', kind: 'dest-zip' },
    { key: 'state', header: 'State', kind: 'state' },
    { key: 'billable-weight', header: 'Billable Weight', kind: 'billable-weight' },
    { key: 'billable-unit', header: 'Billable Unit', kind: 'billable-unit' },
  ]

  const multiProviders = new Set<string>()

  for (const tableRow of tableRows) {
    if (tableRow.kind === 'single') {
      const wid = tableRow.warehouseId
      const w = whById.get(wid)
      if (!w) continue
      const prefix = `${tableRow.providerName} — ${tableRow.locationLabel}`
      columns.push({
        key: `wh-zone-${wid}`,
        header: `${prefix} Zone`,
        kind: 'warehouse-zone',
        warehouseId: wid,
      })
      columns.push({
        key: `wh-cost-${wid}`,
        header: `${prefix} Cost`,
        kind: 'warehouse-cost',
        warehouseId: wid,
      })
    } else {
      // Multi-location provider — per-location pairs first, then optimized triple
      if (tableRow.allExcluded) {
        // Still add location columns for auditability (spec requirement)
        for (const loc of tableRow.locations) {
          const wid = loc.warehouseId
          const prefix = `${tableRow.providerName} — ${loc.locationLabel}`
          columns.push({
            key: `wh-zone-${wid}`,
            header: `${prefix} Zone`,
            kind: 'warehouse-zone',
            warehouseId: wid,
          })
          columns.push({
            key: `wh-cost-${wid}`,
            header: `${prefix} Cost`,
            kind: 'warehouse-cost',
            warehouseId: wid,
          })
        }
        // No optimized triple — 0 of M, can't optimize
        continue
      }

      multiProviders.add(tableRow.providerName)

      for (const loc of tableRow.locations) {
        const wid = loc.warehouseId
        const prefix = `${tableRow.providerName} — ${loc.locationLabel}`
        columns.push({
          key: `wh-zone-${wid}`,
          header: `${prefix} Zone`,
          kind: 'warehouse-zone',
          warehouseId: wid,
        })
        columns.push({
          key: `wh-cost-${wid}`,
          header: `${prefix} Cost`,
          kind: 'warehouse-cost',
          warehouseId: wid,
        })
      }

      const pn = tableRow.providerName
      columns.push({ key: `opt-zone-${pn}`, header: `${pn} (Optimized) Zone`, kind: 'opt-zone', providerName: pn })
      columns.push({ key: `opt-cost-${pn}`, header: `${pn} (Optimized) Cost`, kind: 'opt-cost', providerName: pn })
      columns.push({ key: `opt-winner-${pn}`, header: `${pn} (Optimized) Winning Location`, kind: 'opt-winner', providerName: pn })
    }
  }

  // ─── Compute optimized winners per provider ─────────────────────────────────
  const orderResults = matrixEntriesToOrderResults(matrix)

  const optWinnersByProvider = new Map<string, Map<number, { zone: number; costCents: number; label: string }>>()

  for (const providerName of multiProviders) {
    const group = byProvider.get(providerName) ?? []
    const providerIds = group.map((w) => w.id)
    const includedIds = providerIds.filter((id) => !excludedSet.has(id))
    if (includedIds.length === 0) continue

    const summary = computeProviderOptimized({
      providerName,
      providerWarehouseIds: providerIds,
      includedWarehouseIds: includedIds,
      orderResults,
    })
    if (!summary) continue

    const winnerMap = new Map<number, { zone: number; costCents: number; label: string }>()
    for (const w of summary.winners) {
      const loc = whById.get(w.winningWarehouseId)
      winnerMap.set(w.orderId, {
        zone: w.winningZone,
        costCents: w.winningCostCents,
        label: loc?.location_label ?? String(w.winningWarehouseId),
      })
    }
    optWinnersByProvider.set(providerName, winnerMap)
  }

  // ─── Build per-order → results lookup ──────────────────────────────────────
  const matrixByOrder = new Map<number, typeof matrix[number]['results']>()
  for (const m of matrix) matrixByOrder.set(m.order_id, m.results)

  // ─── Build rows ─────────────────────────────────────────────────────────────
  const rows: PerOrderRow[] = orders.map((o) => {
    const results = matrixByOrder.get(o.id) ?? []

    const warehouseZones: Record<number, number> = {}
    const warehouseCosts: Record<number, number> = {}
    let billableWeightValue: number | null = null
    let billableWeightUnit: 'oz' | 'lbs' | null = null

    for (const r of results) {
      warehouseZones[r.warehouse_id] = r.zone
      warehouseCosts[r.warehouse_id] = r.total_cost_cents
      // Use the first result's billable weight for the constant columns
      if (billableWeightValue === null) {
        billableWeightValue = r.billable_weight_value
        billableWeightUnit = r.billable_weight_unit as 'oz' | 'lbs'
      }
    }

    const optZones: Record<string, number> = {}
    const optCosts: Record<string, number> = {}
    const optWinners: Record<string, string> = {}

    for (const [providerName, winnerMap] of optWinnersByProvider) {
      const winner = winnerMap.get(o.id)
      if (winner) {
        optZones[providerName] = winner.zone
        optCosts[providerName] = winner.costCents
        optWinners[providerName] = winner.label
      }
    }

    const dims =
      o.length !== null && o.width !== null && o.height !== null
        ? `${o.length}×${o.width}×${o.height}`
        : null

    return {
      orderId: o.id,
      orderNumber: o.order_number,
      actualWeightLbs: o.actual_weight_lbs,
      dims,
      destZip: o.dest_zip,
      state: o.state,
      billableWeightValue,
      billableWeightUnit,
      warehouseZones,
      warehouseCosts,
      optZones,
      optCosts,
      optWinners,
    }
  })

  return { columns, rows }
}
