import { OrderResult, OrderBestResult, TplSummary, LocationSummary, TplInput } from '@/types'

/**
 * Aggregates results for a single TPL into a TplSummary.
 *
 * - orderBestResults: the optimized per-order picks (one per order per TPL)
 * - orderResults: all order × location × rate-card combinations (used for zone info)
 */
export function aggregateTplResults(
  tplInput: TplInput,
  orderBestResults: Array<Omit<OrderBestResult, 'id'>>,
  orderResults: OrderResult[]
): TplSummary {
  const { tpl, locations } = tplInput

  const bestResults = orderBestResults.filter(r => r.tplId === tpl.id)

  const orderCount = bestResults.length
  const totalCostCents = bestResults.reduce((sum, r) => sum + r.bestTotalCostCents, 0)
  const avgCostCents = orderCount > 0 ? Math.round(totalCostCents / orderCount) : 0

  // Zone distribution and avg cost by zone — derived from the winning OrderResult per best result
  const zoneDistribution: Record<number, number> = {}
  const zoneCosts: Record<number, number[]> = {}

  for (const best of bestResults) {
    const result = orderResults.find(
      r =>
        r.orderId === best.orderId &&
        r.locationId === best.bestLocationId &&
        r.rateCardId === best.bestRateCardId &&
        r.tplId === tpl.id
    )
    if (result?.zone != null) {
      zoneDistribution[result.zone] = (zoneDistribution[result.zone] ?? 0) + 1
      if (!zoneCosts[result.zone]) zoneCosts[result.zone] = []
      zoneCosts[result.zone].push(best.bestTotalCostCents)
    }
  }

  const avgCostByZone: Record<number, number> = {}
  for (const [zone, costs] of Object.entries(zoneCosts)) {
    avgCostByZone[Number(zone)] = Math.round(costs.reduce((s, c) => s + c, 0) / costs.length)
  }

  // Per-location breakdown: how many orders each location "won" (was the cheapest)
  const locationSummaries: LocationSummary[] = locations.map(li => {
    const locBest = bestResults.filter(r => r.bestLocationId === li.location.id)
    const locCount = locBest.length
    const locTotal = locBest.reduce((s, r) => s + r.bestTotalCostCents, 0)
    const locAvg = locCount > 0 ? Math.round(locTotal / locCount) : 0

    const locZoneDist: Record<number, number> = {}
    for (const best of locBest) {
      const result = orderResults.find(
        r =>
          r.orderId === best.orderId &&
          r.locationId === li.location.id &&
          r.rateCardId === best.bestRateCardId &&
          r.tplId === tpl.id
      )
      if (result?.zone != null) {
        locZoneDist[result.zone] = (locZoneDist[result.zone] ?? 0) + 1
      }
    }

    return {
      locationId: li.location.id,
      locationName: li.location.name,
      originZip3: li.location.originZip3,
      orderCount: locCount,
      totalCostCents: locTotal,
      avgCostCents: locAvg,
      zoneDistribution: locZoneDist,
    }
  })

  return {
    tplId: tpl.id,
    tplName: tpl.name,
    multiNodeEnabled: tpl.multiNodeEnabled,
    orderCount,
    totalCostCents,
    avgCostCents,
    zoneDistribution,
    avgCostByZone,
    locationSummaries,
  }
}
