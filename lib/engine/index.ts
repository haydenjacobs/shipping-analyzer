import { EngineInput, EngineOutput, OrderResult, OrderBestResult } from '@/types'
import { lookupZone } from './zone-lookup'
import { calculateBillableWeight } from './weight-calc'
import { lookupRate } from './rate-lookup'
import { applySurcharge } from './surcharge'
import { aggregateTplResults } from './aggregation'
import { isValidZip5 } from '@/lib/utils/zip'

/**
 * Main calculation engine.
 *
 * CONSISTENCY RULE: If an order fails validation for ANY location/rate-card
 * combination of ANY TPL, it is excluded from ALL TPLs so every TPL is
 * evaluated on an identical order set.
 *
 * Passes:
 *   1. Validation  — find orders that cannot be calculated for any TPL
 *   2. Calculation — produce OrderResult for every order × location × rate card
 *   3. Optimization — pick the cheapest location × rate card per order per TPL
 *   4. Aggregation — build TplSummary from best results
 */
export function runCalculationEngine(input: EngineInput): EngineOutput {
  const { orders, tpls } = input
  const excludedOrderIds = new Set<number>()
  const exclusionReasons = new Map<number, string>()
  const warnings: string[] = []

  // ── Pass 1: Validation ──────────────────────────────────────────────────────
  for (const order of orders) {
    if (!isValidZip5(order.destZip)) {
      excludedOrderIds.add(order.id)
      exclusionReasons.set(order.id, `Invalid destination ZIP: ${order.destZip}`)
      continue
    }
    if (!order.actualWeightLbs || order.actualWeightLbs <= 0) {
      excludedOrderIds.add(order.id)
      exclusionReasons.set(order.id, `Invalid weight: ${order.actualWeightLbs}`)
      continue
    }

    let failed = false
    outer: for (const tplInput of tpls) {
      const { tpl, locations, rateCards } = tplInput

      for (const locInput of locations) {
        const zoneResult = lookupZone(order.destZip3, locInput.zoneMaps)
        if (!zoneResult.ok) {
          excludedOrderIds.add(order.id)
          exclusionReasons.set(
            order.id,
            `Zone not found for ${locInput.location.name} (ZIP3 ${locInput.location.originZip3} → ${order.destZip3})`
          )
          failed = true
          break outer
        }

        for (const rcw of rateCards) {
          const weightResult = calculateBillableWeight({
            actualWeightLbs: order.actualWeightLbs,
            height: order.height,
            width: order.width,
            length: order.length,
            dimWeightEnabled: tpl.dimWeightEnabled,
            dimFactor: tpl.dimFactor,
            weightUnitMode: rcw.rateCard.weightUnitMode,
          })
          if (!weightResult.ok) {
            excludedOrderIds.add(order.id)
            exclusionReasons.set(
              order.id,
              `Weight calc failed for ${tpl.name} / ${rcw.rateCard.name}: ${weightResult.error}`
            )
            failed = true
            break outer
          }

          const rateResult = lookupRate(
            weightResult.billableWeightValue,
            weightResult.billableWeightUnit,
            zoneResult.zone,
            rcw.entries
          )
          if (!rateResult.ok) {
            excludedOrderIds.add(order.id)
            exclusionReasons.set(
              order.id,
              `Weight exceeds max rate card entry for "${rcw.rateCard.name}" (${tpl.name})`
            )
            failed = true
            break outer
          }
        }
      }

      if (failed) break
    }
  }

  // ── Pass 2: Calculation ─────────────────────────────────────────────────────
  const allResults: OrderResult[] = []

  for (const order of orders) {
    if (excludedOrderIds.has(order.id)) continue

    for (const tplInput of tpls) {
      const { tpl, locations, rateCards } = tplInput

      for (const locInput of locations) {
        const zoneResult = lookupZone(order.destZip3, locInput.zoneMaps)
        if (!zoneResult.ok) continue

        for (const rcw of rateCards) {
          const weightResult = calculateBillableWeight({
            actualWeightLbs: order.actualWeightLbs,
            height: order.height,
            width: order.width,
            length: order.length,
            dimWeightEnabled: tpl.dimWeightEnabled,
            dimFactor: tpl.dimFactor,
            weightUnitMode: rcw.rateCard.weightUnitMode,
          })
          if (!weightResult.ok) continue

          const rateResult = lookupRate(
            weightResult.billableWeightValue,
            weightResult.billableWeightUnit,
            zoneResult.zone,
            rcw.entries
          )
          if (!rateResult.ok) continue

          const baseCostCents = rateResult.priceCents
          const surchargeCents = tpl.surchargeFlatCents
          const totalCostCents = applySurcharge(baseCostCents, surchargeCents)

          const notes = [
            `Zone ${zoneResult.zone} from ${locInput.location.name} (${locInput.location.originZip3}→${order.destZip3})`,
            `${weightResult.billableWeightValue}${weightResult.billableWeightUnit}`,
            weightResult.dimWeightLbs != null
              ? `dim=${weightResult.dimWeightLbs.toFixed(4)}lbs`
              : null,
            `rate $${(baseCostCents / 100).toFixed(2)}`,
            surchargeCents > 0 ? `surcharge $${(surchargeCents / 100).toFixed(2)}` : null,
            `total $${(totalCostCents / 100).toFixed(2)}`,
          ]
            .filter(Boolean)
            .join(', ')

          allResults.push({
            orderId: order.id,
            locationId: locInput.location.id,
            tplId: tpl.id,
            zone: zoneResult.zone,
            billableWeightValue: weightResult.billableWeightValue,
            billableWeightUnit: weightResult.billableWeightUnit,
            dimWeightLbs: weightResult.dimWeightLbs,
            rateCardId: rcw.rateCard.id,
            baseCostCents,
            surchargeCents,
            totalCostCents,
            isValid: true,
            errorReason: null,
            calculationNotes: notes,
          })
        }
      }
    }
  }

  // ── Pass 3: Optimization ────────────────────────────────────────────────────
  // Always optimize across all locations × rate cards per order per TPL.
  // The UI decides what to display based on multi_node_enabled.
  const allBestResults: Array<Omit<OrderBestResult, 'id'>> = []

  for (const order of orders) {
    if (excludedOrderIds.has(order.id)) continue

    for (const tplInput of tpls) {
      const { tpl } = tplInput
      const tplResults = allResults.filter(
        r => r.orderId === order.id && r.tplId === tpl.id
      )
      if (tplResults.length === 0) continue

      const best = tplResults.reduce((a, b) =>
        (a.totalCostCents ?? Infinity) <= (b.totalCostCents ?? Infinity) ? a : b
      )

      allBestResults.push({
        orderId: order.id,
        tplId: tpl.id,
        bestLocationId: best.locationId,
        bestRateCardId: best.rateCardId!,
        bestTotalCostCents: best.totalCostCents!,
      })
    }
  }

  // ── Pass 4: Aggregation ─────────────────────────────────────────────────────
  const tplSummaries = tpls.map(tplInput =>
    aggregateTplResults(tplInput, allBestResults, allResults)
  )

  const includedOrderIds = orders
    .filter(o => !excludedOrderIds.has(o.id))
    .map(o => o.id)

  const excludedOrders = Array.from(excludedOrderIds).map(id => {
    const order = orders.find(o => o.id === id)!
    return {
      orderId: id,
      orderNumber: order.orderNumber,
      reason: exclusionReasons.get(id) ?? 'Unknown error',
    }
  })

  return {
    orderResults: allResults,
    orderBestResults: allBestResults,
    tplSummaries,
    includedOrderIds,
    excludedOrders,
    warnings,
  }
}
