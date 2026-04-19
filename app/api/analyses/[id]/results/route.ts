import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  analyses,
  orders,
  tpls,
  locations,
  orderResults,
  orderBestResults,
} from '@/lib/db/schema'
import { eq, inArray } from 'drizzle-orm'
import type { TplSummary, LocationSummary } from '@/types'

/**
 * GET /api/analyses/:id/results
 * Reconstructs TplSummaries from stored order_best_results and order_results.
 * Returns the same shape as the POST /api/calculate response.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await params
  const id = parseInt(idStr)

  const [analysis] = await db.select().from(analyses).where(eq(analyses.id, id))
  if (!analysis) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (analysis.status !== 'complete') {
    return NextResponse.json({ tplSummaries: [], includedOrders: 0, excludedOrders: 0, excluded: [], warnings: [] })
  }

  const allOrders = await db.select().from(orders).where(eq(orders.analysisId, id))
  if (allOrders.length === 0) {
    return NextResponse.json({ tplSummaries: [], includedOrders: 0, excludedOrders: 0, excluded: [], warnings: [] })
  }

  const orderIds = allOrders.map(o => o.id)
  const allTpls = await db.select().from(tpls).where(eq(tpls.analysisId, id))
  if (allTpls.length === 0) {
    return NextResponse.json({ tplSummaries: [], includedOrders: 0, excludedOrders: 0, excluded: [], warnings: [] })
  }

  const tplIds = allTpls.map(t => t.id)
  const allLocations = await db.select().from(locations).where(inArray(locations.tplId, tplIds))
  const bestResults = await db.select().from(orderBestResults).where(inArray(orderBestResults.orderId, orderIds))
  const results = await db.select().from(orderResults).where(inArray(orderResults.orderId, orderIds))

  const tplSummaries: TplSummary[] = allTpls
    .map(tpl => {
      const tplBest = bestResults.filter(r => r.tplId === tpl.id)
      const orderCount = tplBest.length
      const totalCostCents = tplBest.reduce((s, r) => s + r.bestTotalCostCents, 0)
      const avgCostCents = orderCount > 0 ? Math.round(totalCostCents / orderCount) : 0

      const zoneDistribution: Record<number, number> = {}
      const zoneCosts: Record<number, number[]> = {}

      for (const best of tplBest) {
        const result = results.find(
          r =>
            r.orderId === best.orderId &&
            r.locationId === best.bestLocationId &&
            r.rateCardId === best.bestRateCardId &&
            r.tplId === tpl.id
        )
        if (result?.zone != null) {
          zoneDistribution[result.zone] = (zoneDistribution[result.zone] ?? 0) + 1
          zoneCosts[result.zone] = [...(zoneCosts[result.zone] ?? []), best.bestTotalCostCents]
        }
      }

      const avgCostByZone: Record<number, number> = {}
      for (const [zone, costs] of Object.entries(zoneCosts)) {
        avgCostByZone[Number(zone)] = Math.round(costs.reduce((s, c) => s + c, 0) / costs.length)
      }

      const tplLocations = allLocations.filter(l => l.tplId === tpl.id)
      const locationSummaries: LocationSummary[] = tplLocations.map(loc => {
        const locBest = tplBest.filter(r => r.bestLocationId === loc.id)
        const locCount = locBest.length
        const locTotal = locBest.reduce((s, r) => s + r.bestTotalCostCents, 0)
        const locAvg = locCount > 0 ? Math.round(locTotal / locCount) : 0
        const locZoneDist: Record<number, number> = {}
        for (const best of locBest) {
          const result = results.find(
            r =>
              r.orderId === best.orderId &&
              r.locationId === loc.id &&
              r.rateCardId === best.bestRateCardId &&
              r.tplId === tpl.id
          )
          if (result?.zone != null) {
            locZoneDist[result.zone] = (locZoneDist[result.zone] ?? 0) + 1
          }
        }
        return {
          locationId: loc.id,
          locationName: loc.name,
          originZip3: loc.originZip3,
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
    })
    .sort((a, b) => a.avgCostCents - b.avgCostCents)

  const includedOrderIds = new Set(bestResults.map(r => r.orderId))
  const includedOrders = includedOrderIds.size
  const excludedOrders = allOrders.length - includedOrders

  return NextResponse.json({
    tplSummaries,
    includedOrders,
    excludedOrders,
    excluded: [],
    warnings: [],
  })
}
