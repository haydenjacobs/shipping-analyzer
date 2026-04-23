import { OrderResult, WarehouseInput, WarehouseSummary } from '@/types'

/**
 * Step 6 — per-warehouse aggregation.
 * Produces one WarehouseSummary per warehouse over the set of valid OrderResults.
 */
export function aggregateWarehouse(
  warehouseInput: WarehouseInput,
  orderResults: OrderResult[],
): WarehouseSummary {
  const { warehouse } = warehouseInput
  const results = orderResults.filter(r => r.warehouseId === warehouse.id)

  const orderCount = results.length
  const totalCostCents = results.reduce((s, r) => s + r.totalCostCents, 0)
  const avgCostCents = orderCount > 0 ? Math.round(totalCostCents / orderCount) : 0

  const zoneSum = results.reduce((s, r) => s + r.zone, 0)
  const avgZone = orderCount > 0 ? zoneSum / orderCount : 0

  const zoneDistribution: Record<number, number> = {}
  const zoneCostAccum: Record<number, { sum: number; n: number }> = {}
  for (const r of results) {
    zoneDistribution[r.zone] = (zoneDistribution[r.zone] ?? 0) + 1
    const acc = zoneCostAccum[r.zone] ?? { sum: 0, n: 0 }
    acc.sum += r.totalCostCents
    acc.n += 1
    zoneCostAccum[r.zone] = acc
  }

  const avgCostByZone: Record<number, number> = {}
  for (const [zoneStr, { sum, n }] of Object.entries(zoneCostAccum)) {
    avgCostByZone[Number(zoneStr)] = Math.round(sum / n)
  }

  return {
    warehouseId: warehouse.id,
    providerName: warehouse.providerName,
    locationLabel: warehouse.locationLabel,
    originZip3: warehouse.originZip3,
    orderCount,
    totalCostCents,
    avgCostCents,
    avgZone,
    zoneDistribution,
    avgCostByZone,
  }
}
