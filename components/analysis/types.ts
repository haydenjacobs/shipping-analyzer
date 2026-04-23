// Shared types for the Analysis Workspace UI layer.
// These mirror the API response shapes from GET /api/analyses/[id].

export interface RateCardInfo {
  id: number
  warehouseId: number
  name: string
  weightUnitMode: string
  createdAt: string
}

export interface WarehouseWithRateCards {
  id: number
  analysisId: number
  providerName: string
  locationLabel: string
  originZip: string
  originZip3: string
  dimWeightEnabled: boolean
  dimFactor: number | null
  surchargeFlatCents: number
  notes: string | null
  rateCards: RateCardInfo[]
}

export interface AnalysisData {
  id: number
  name: string
  status: 'draft' | 'complete'
  viewMode: 'optimized' | 'single_node'
  excludedLocations: number[]
  projectedOrderCount: number | null
  projectedPeriod: 'month' | 'year'
  warehouses: WarehouseWithRateCards[]
  orderCount: number
}

export type WorkspaceTab = 'orders' | 'providers' | 'calculate' | 'results'

export interface ProviderGroup {
  providerName: string
  warehouses: WarehouseWithRateCards[]
  /** Rate card from the first warehouse that has one (provider-level UX). */
  rateCard: RateCardInfo | null
}

export function groupByProvider(warehouses: WarehouseWithRateCards[]): ProviderGroup[] {
  const map = new Map<string, WarehouseWithRateCards[]>()
  for (const wh of warehouses) {
    const list = map.get(wh.providerName) ?? []
    list.push(wh)
    map.set(wh.providerName, list)
  }
  return [...map.entries()].map(([providerName, whList]) => ({
    providerName,
    warehouses: whList,
    rateCard: whList.find((w) => w.rateCards.length > 0)?.rateCards[0] ?? null,
  }))
}

export function getCalculateStatus(
  analysis: AnalysisData | null,
): 'needs_inputs' | 'ready' | 'complete' | 'error' {
  if (!analysis) return 'needs_inputs'
  if (analysis.status === 'complete') return 'complete'
  if (analysis.orderCount === 0) return 'needs_inputs'
  if (analysis.warehouses.length === 0) return 'needs_inputs'
  const providers = groupByProvider(analysis.warehouses)
  if (providers.some((p) => !p.rateCard)) return 'needs_inputs'
  return 'ready'
}
