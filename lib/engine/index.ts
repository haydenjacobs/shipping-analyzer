import {
  EngineInput,
  EngineOutput,
  ExcludedOrder,
  Order,
  OrderResult,
  RateCardWithEntries,
  WarehouseInput,
} from '@/types'
import { lookupZone } from './zone-lookup'
import { calculateBillableWeight } from './weight-calc'
import { lookupRate } from './rate-lookup'
import { applySurcharge } from './surcharge'
import { aggregateWarehouse } from './aggregation'
import { isValidZip5 } from '@/lib/utils/zip'

/**
 * Warehouse-centric calculation engine.
 *
 * CONSISTENCY RULE (Step 1): if an order cannot be calculated for ANY warehouse
 * (zone missing, weight exceeds rate card, bad ZIP, etc.), it is excluded from
 * ALL warehouses so every warehouse is evaluated against the same order set.
 *
 * Passes:
 *   1. Validation  — enumerate invalid orders with reasons
 *   2. Calculation — produce one OrderResult per (order × warehouse), picking
 *                    the cheapest rate card when a warehouse has multiple
 *   3. Aggregation — per-warehouse summaries
 *
 * Optimized-mode (Step 7) aggregation is NOT run here. It's a pure function on
 * the OrderResult matrix (see lib/engine/optimized.ts) invoked on demand by
 * callers with the current excluded_locations state.
 */
export function runCalculationEngine(input: EngineInput): EngineOutput {
  const { orders, warehouses } = input
  const warnings: string[] = []

  // ── Pass 1: Validation ──────────────────────────────────────────────────────
  const excluded: ExcludedOrder[] = []
  const excludedOrderIds = new Set<number>()

  function excludeOrder(
    orderId: number,
    warehouseId: number | null,
    reason: string,
    details: string | null = null,
  ) {
    if (excludedOrderIds.has(orderId)) return
    excludedOrderIds.add(orderId)
    excluded.push({ orderId, warehouseId, reason, details })
  }

  for (const order of orders) {
    if (!isValidZip5(order.destZip)) {
      excludeOrder(order.id, null, 'invalid_dest_zip', `destZip=${order.destZip}`)
      continue
    }
    if (!Number.isFinite(order.actualWeightLbs) || order.actualWeightLbs <= 0) {
      excludeOrder(order.id, null, 'invalid_weight', `weight=${order.actualWeightLbs}`)
      continue
    }

    for (const whInput of warehouses) {
      const failure = firstCalcFailure(order, whInput)
      if (failure) {
        excludeOrder(order.id, whInput.warehouse.id, failure.reason, failure.details)
        break
      }
    }
  }

  // ── Pass 2: Calculation ─────────────────────────────────────────────────────
  const orderResults: OrderResult[] = []

  for (const order of orders) {
    if (excludedOrderIds.has(order.id)) continue

    for (const whInput of warehouses) {
      const result = calcOneResult(order, whInput)
      // pass 1 already guaranteed success for included orders; null here means
      // a warehouse has zero rate cards, which we surface as a warning.
      if (result) orderResults.push(result)
    }
  }

  // ── Pass 3: Aggregation ─────────────────────────────────────────────────────
  const warehouseSummaries = warehouses.map(wh => aggregateWarehouse(wh, orderResults))

  const includedOrderIds = orders
    .filter(o => !excludedOrderIds.has(o.id))
    .map(o => o.id)

  return {
    orderResults,
    warehouseSummaries,
    excludedOrders: excluded,
    includedOrderIds,
    warnings,
  }
}

// ─── Internals ────────────────────────────────────────────────────────────────

interface CalcFailure {
  reason: string
  details: string
}

/**
 * Returns the first reason this order can't be calculated for this warehouse,
 * or null if every rate card on the warehouse produces a price. For a multi-
 * rate-card warehouse the order is considered calculable as long as AT LEAST
 * ONE rate card succeeds — we then pick the cheapest in calcOneResult.
 */
function firstCalcFailure(order: Order, whInput: WarehouseInput): CalcFailure | null {
  const { warehouse, zoneMaps, rateCards } = whInput

  const zoneRes = lookupZone(order.destZip3, zoneMaps)
  if (!zoneRes.ok) {
    return {
      reason: 'zone_not_found',
      details: `${warehouse.originZip3} → ${order.destZip3}`,
    }
  }

  if (rateCards.length === 0) {
    return {
      reason: 'no_rate_card',
      details: `warehouse ${warehouse.id} has no rate cards`,
    }
  }

  // Collect failures; require at least one rate card to succeed
  const failures: CalcFailure[] = []
  for (const rcw of rateCards) {
    const fail = tryRateCard(order, whInput, rcw, zoneRes.zone)
    if (fail === null) return null // some card worked → overall: calcable
    failures.push(fail)
  }
  // Every card failed — surface the first failure
  return failures[0]
}

/**
 * Try a single rate card. Returns null on success, a CalcFailure otherwise.
 */
function tryRateCard(
  order: Order,
  whInput: WarehouseInput,
  rcw: RateCardWithEntries,
  zone: number,
): CalcFailure | null {
  const { warehouse } = whInput
  const wt = calculateBillableWeight({
    actualWeightLbs: order.actualWeightLbs,
    height: order.height,
    width: order.width,
    length: order.length,
    dimWeightEnabled: warehouse.dimWeightEnabled,
    dimFactor: warehouse.dimFactor,
    weightUnitMode: rcw.rateCard.weightUnitMode,
  })
  if (!wt.ok) return { reason: 'weight_calc_failed', details: wt.error }

  const rate = lookupRate(wt.billableWeightValue, wt.billableWeightUnit, zone, rcw.entries)
  if (!rate.ok) return { reason: 'rate_not_found', details: rate.error }

  return null
}

/**
 * Compute a single OrderResult (order × warehouse). If the warehouse has
 * multiple rate cards, picks the cheapest cents. Returns null only if every
 * rate card fails or there are none — which shouldn't happen for orders that
 * survived validation.
 */
function calcOneResult(order: Order, whInput: WarehouseInput): OrderResult | null {
  const { warehouse, zoneMaps, rateCards } = whInput
  const zoneRes = lookupZone(order.destZip3, zoneMaps)
  if (!zoneRes.ok) return null
  const zone = zoneRes.zone

  let best: OrderResult | null = null
  for (const rcw of rateCards) {
    const wt = calculateBillableWeight({
      actualWeightLbs: order.actualWeightLbs,
      height: order.height,
      width: order.width,
      length: order.length,
      dimWeightEnabled: warehouse.dimWeightEnabled,
      dimFactor: warehouse.dimFactor,
      weightUnitMode: rcw.rateCard.weightUnitMode,
    })
    if (!wt.ok) continue
    const rate = lookupRate(wt.billableWeightValue, wt.billableWeightUnit, zone, rcw.entries)
    if (!rate.ok) continue

    const baseCostCents = rate.priceCents
    const surchargeCents = warehouse.surchargeFlatCents
    const totalCostCents = applySurcharge(baseCostCents, surchargeCents)

    const notes = buildNotes({
      zone,
      billableValue: wt.billableWeightValue,
      billableUnit: wt.billableWeightUnit,
      dimWeightLbs: wt.dimWeightLbs,
      baseCostCents,
      surchargeCents,
      totalCostCents,
      rateCardName: rcw.rateCard.name,
    })

    const candidate: OrderResult = {
      orderId: order.id,
      warehouseId: warehouse.id,
      zone,
      billableWeightValue: wt.billableWeightValue,
      billableWeightUnit: wt.billableWeightUnit,
      dimWeightLbs: wt.dimWeightLbs,
      rateCardId: rcw.rateCard.id,
      baseCostCents,
      surchargeCents,
      totalCostCents,
      calculationNotes: notes,
    }

    if (
      !best ||
      candidate.totalCostCents < best.totalCostCents ||
      (candidate.totalCostCents === best.totalCostCents && candidate.rateCardId < best.rateCardId)
    ) {
      best = candidate
    }
  }
  return best
}

function buildNotes(p: {
  zone: number
  billableValue: number
  billableUnit: 'oz' | 'lbs'
  dimWeightLbs: number | null
  baseCostCents: number
  surchargeCents: number
  totalCostCents: number
  rateCardName: string
}): string {
  const parts = [
    `zone=${p.zone}`,
    `billable=${p.billableValue}${p.billableUnit}`,
    p.dimWeightLbs != null ? `dim=${p.dimWeightLbs.toFixed(4)}lbs` : null,
    `card="${p.rateCardName}"`,
    `base=$${(p.baseCostCents / 100).toFixed(2)}`,
    p.surchargeCents > 0 ? `surcharge=$${(p.surchargeCents / 100).toFixed(2)}` : null,
    `total=$${(p.totalCostCents / 100).toFixed(2)}`,
  ].filter(Boolean)
  return parts.join(' ')
}

export { computeProviderOptimized } from './optimized'
export { runAnalysis, AnalysisEngineError, AnalysisNotFoundError } from './run-analysis'
export type { RunAnalysisResult } from './run-analysis'
