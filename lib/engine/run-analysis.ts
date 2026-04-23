/**
 * DB-backed orchestration for the calculation engine.
 *
 * Pulls an analysis's orders/warehouses/rate cards/zone maps out of SQLite,
 * hands them to the pure `runCalculationEngine`, then persists the resulting
 * OrderResult matrix + excluded orders atomically. Step 7 (Optimized) is NOT
 * run here — it's a client-side pure function over the OrderResult matrix.
 */
import { db, sqlite } from '@/lib/db'
import {
  analyses,
  excludedOrders as excludedOrdersTable,
  orderResults as orderResultsTable,
  orders as ordersTable,
  rateCardEntries as rateCardEntriesTable,
  rateCards as rateCardsTable,
  warehouses as warehousesTable,
  zoneMaps as zoneMapsTable,
} from '@/lib/db/schema'
import type {
  EngineInput,
  EngineOutput,
  Order,
  RateCardEntry,
  RateCardWithEntries,
  Warehouse,
  WarehouseInput,
  WarehouseSummary,
} from '@/types'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { runCalculationEngine } from './index'

export interface RunAnalysisResult {
  includedCount: number
  excludedCount: number
  warehouses: WarehouseSummary[]
}

export class AnalysisNotFoundError extends Error {
  constructor(id: number) {
    super(`Analysis ${id} not found`)
    this.name = 'AnalysisNotFoundError'
  }
}

export class AnalysisEngineError extends Error {
  constructor(message: string, public readonly output?: EngineOutput) {
    super(message)
    this.name = 'AnalysisEngineError'
  }
}

export function runAnalysis(analysisId: number): RunAnalysisResult {
  const analysisRow = db
    .select({ id: analyses.id })
    .from(analyses)
    .where(eq(analyses.id, analysisId))
    .get()
  if (!analysisRow) throw new AnalysisNotFoundError(analysisId)

  const warehouseRows = db
    .select()
    .from(warehousesTable)
    .where(eq(warehousesTable.analysisId, analysisId))
    .all()

  const orderRows = db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.analysisId, analysisId))
    .all()

  if (warehouseRows.length === 0) {
    throw new AnalysisEngineError('Analysis has no warehouses to calculate against')
  }
  if (orderRows.length === 0) {
    throw new AnalysisEngineError('Analysis has no orders to calculate')
  }

  // Load rate cards + entries for the warehouses in this analysis
  const whIds = warehouseRows.map((w) => w.id)
  const rateCardRows =
    whIds.length === 0
      ? []
      : db
          .select()
          .from(rateCardsTable)
          .where(inArray(rateCardsTable.warehouseId, whIds))
          .all()
  const rateCardIds = rateCardRows.map((rc) => rc.id)
  const entryRows =
    rateCardIds.length === 0
      ? []
      : db
          .select()
          .from(rateCardEntriesTable)
          .where(inArray(rateCardEntriesTable.rateCardId, rateCardIds))
          .all()

  const entriesByRateCard = new Map<number, RateCardEntry[]>()
  for (const e of entryRows) {
    const list = entriesByRateCard.get(e.rateCardId) ?? []
    list.push(e)
    entriesByRateCard.set(e.rateCardId, list)
  }

  const rateCardsByWarehouse = new Map<number, RateCardWithEntries[]>()
  for (const rc of rateCardRows) {
    const list = rateCardsByWarehouse.get(rc.warehouseId) ?? []
    list.push({ rateCard: rc, entries: entriesByRateCard.get(rc.id) ?? [] })
    rateCardsByWarehouse.set(rc.warehouseId, list)
  }

  // Build per-warehouse zone maps, restricted to the destZip3 set we need.
  const destZip3s = Array.from(new Set(orderRows.map((o) => o.destZip3)))
  const originZip3s = Array.from(new Set(warehouseRows.map((w) => w.originZip3)))

  const zoneRowsAll =
    destZip3s.length === 0 || originZip3s.length === 0
      ? []
      : db
          .select()
          .from(zoneMapsTable)
          .where(
            and(
              inArray(zoneMapsTable.originZip3, originZip3s),
              inArray(zoneMapsTable.destZip3, destZip3s),
            ),
          )
          .all()

  const zoneByOrigin = new Map<string, Map<string, number>>()
  for (const z of zoneRowsAll) {
    let inner = zoneByOrigin.get(z.originZip3)
    if (!inner) {
      inner = new Map()
      zoneByOrigin.set(z.originZip3, inner)
    }
    inner.set(z.destZip3, z.zone)
  }

  const orders: Order[] = orderRows.map((o) => ({
    id: o.id,
    analysisId: o.analysisId,
    orderNumber: o.orderNumber,
    destZip: o.destZip,
    destZip3: o.destZip3,
    actualWeightLbs: o.actualWeightLbs,
    height: o.height,
    width: o.width,
    length: o.length,
    state: o.state,
  }))

  const warehouseInputs: WarehouseInput[] = warehouseRows.map((w) => {
    const whouse: Warehouse = {
      id: w.id,
      analysisId: w.analysisId,
      providerName: w.providerName,
      locationLabel: w.locationLabel,
      originZip: w.originZip,
      originZip3: w.originZip3,
      dimWeightEnabled: w.dimWeightEnabled,
      dimFactor: w.dimFactor,
      surchargeFlatCents: w.surchargeFlatCents,
      notes: w.notes,
    }
    return {
      warehouse: whouse,
      zoneMaps: zoneByOrigin.get(w.originZip3) ?? new Map(),
      rateCards: rateCardsByWarehouse.get(w.id) ?? [],
    }
  })

  const input: EngineInput = { orders, warehouses: warehouseInputs }
  const output = runCalculationEngine(input)

  // Persist atomically: wipe existing results + excluded rows for this analysis,
  // then insert fresh. ON DELETE CASCADE handles order_results when orders are
  // deleted, but we're preserving orders and only refreshing the derived tables.
  //
  // Inserts are chunked to avoid Drizzle's recursive query-builder hitting the
  // JS call stack limit on large analyses (thousands of rows × columns).
  const CHUNK_SIZE = 500
  const orderIds = orders.map((o) => o.id)

  sqlite.transaction(() => {
    if (orderIds.length > 0) {
      db.delete(orderResultsTable)
        .where(inArray(orderResultsTable.orderId, orderIds))
        .run()
      db.delete(excludedOrdersTable)
        .where(inArray(excludedOrdersTable.orderId, orderIds))
        .run()
    }

    const excludedRows = output.excludedOrders.map((e) => ({
      orderId: e.orderId,
      warehouseId: e.warehouseId,
      reason: e.reason,
      details: e.details,
    }))
    for (let i = 0; i < excludedRows.length; i += CHUNK_SIZE) {
      db.insert(excludedOrdersTable).values(excludedRows.slice(i, i + CHUNK_SIZE)).run()
    }

    const resultRows = output.orderResults.map((r) => ({
      orderId: r.orderId,
      warehouseId: r.warehouseId,
      zone: r.zone,
      billableWeightValue: r.billableWeightValue,
      billableWeightUnit: r.billableWeightUnit,
      dimWeightLbs: r.dimWeightLbs,
      rateCardId: r.rateCardId,
      baseCostCents: r.baseCostCents,
      surchargeCents: r.surchargeCents,
      totalCostCents: r.totalCostCents,
      calculationNotes: r.calculationNotes,
    }))
    for (let i = 0; i < resultRows.length; i += CHUNK_SIZE) {
      db.insert(orderResultsTable).values(resultRows.slice(i, i + CHUNK_SIZE)).run()
    }

    db.update(analyses)
      .set({ status: 'complete', updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(analyses.id, analysisId))
      .run()
  })()

  return {
    includedCount: output.includedOrderIds.length,
    excludedCount: output.excludedOrders.length,
    warehouses: output.warehouseSummaries,
  }
}
