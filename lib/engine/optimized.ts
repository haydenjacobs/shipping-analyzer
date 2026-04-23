import { OrderResult, ProviderOptimizedSummary, OptimizedWinner } from '@/types'

/**
 * Step 7 — Optimized-mode aggregation for a single provider group.
 *
 * Pure function: given the OrderResult matrix and a set of warehouse IDs that
 * belong to a provider (and which of them are currently included), produce the
 * optimized aggregates. Deterministic tiebreaker: lowest warehouseId wins.
 *
 * If `includedWarehouseIds` is empty, returns null — caller should hide the
 * provider. If it contains one id, the result effectively equals that
 * warehouse's single-node result.
 */
export function computeProviderOptimized(params: {
  providerName: string
  providerWarehouseIds: number[]  // all warehouses belonging to this provider
  includedWarehouseIds: number[]  // subset currently checked-in
  orderResults: OrderResult[]     // the full matrix (any warehouse ids ok; will be filtered)
}): ProviderOptimizedSummary | null {
  const { providerName, providerWarehouseIds, includedWarehouseIds, orderResults } = params

  if (includedWarehouseIds.length === 0) return null

  const includedSet = new Set(includedWarehouseIds)
  const relevant = orderResults.filter(r => includedSet.has(r.warehouseId))

  // Group results by orderId
  const byOrder = new Map<number, OrderResult[]>()
  for (const r of relevant) {
    const arr = byOrder.get(r.orderId)
    if (arr) arr.push(r)
    else byOrder.set(r.orderId, [r])
  }

  const winners: OptimizedWinner[] = []
  const orderIds = Array.from(byOrder.keys()).sort((a, b) => a - b)

  for (const orderId of orderIds) {
    const candidates = byOrder.get(orderId)!
    let best = candidates[0]
    for (const c of candidates) {
      if (
        c.totalCostCents < best.totalCostCents ||
        (c.totalCostCents === best.totalCostCents && c.warehouseId < best.warehouseId)
      ) {
        best = c
      }
    }
    winners.push({
      orderId,
      winningWarehouseId: best.warehouseId,
      winningCostCents: best.totalCostCents,
      winningZone: best.zone,
    })
  }

  const orderCount = winners.length
  const totalCostCents = winners.reduce((s, w) => s + w.winningCostCents, 0)
  const avgCostCents = orderCount > 0 ? Math.round(totalCostCents / orderCount) : 0
  const zoneSum = winners.reduce((s, w) => s + w.winningZone, 0)
  const avgZone = orderCount > 0 ? zoneSum / orderCount : 0

  const winCount: Record<number, number> = {}
  for (const id of providerWarehouseIds) winCount[id] = 0
  for (const w of winners) winCount[w.winningWarehouseId] = (winCount[w.winningWarehouseId] ?? 0) + 1

  const nodeUtilization: Record<number, number> = {}
  for (const id of providerWarehouseIds) {
    nodeUtilization[id] = orderCount > 0 ? winCount[id] / orderCount : 0
  }

  return {
    providerName,
    includedWarehouseIds: [...includedWarehouseIds].sort((a, b) => a - b),
    totalWarehouseCount: providerWarehouseIds.length,
    orderCount,
    totalCostCents,
    avgCostCents,
    avgZone,
    nodeUtilization,
    winners,
  }
}
