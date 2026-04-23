export type WeightUnitMode = 'oz_only' | 'lbs_only' | 'oz_then_lbs'
export type WeightUnit = 'oz' | 'lbs'
export type AnalysisStatus = 'draft' | 'complete'
export type ViewMode = 'optimized' | 'single_node'
export type ProjectedPeriod = 'month' | 'year'

// ─── Core entities ─────────────────────────────────────────────────────────────

export interface Analysis {
  id: number
  name: string
  createdAt: string
  updatedAt: string
  status: AnalysisStatus
  shareableToken: string | null
  viewMode: ViewMode
  excludedLocations: number[] // parsed from stored JSON text
  projectedOrderCount: number | null
  projectedPeriod: ProjectedPeriod
}

export interface Warehouse {
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
}

export interface RateCard {
  id: number
  warehouseId: number
  name: string
  weightUnitMode: WeightUnitMode
}

export interface RateCardEntry {
  id: number
  rateCardId: number
  weightValue: number // real — supports decimal tiers like 15.99 oz
  weightUnit: WeightUnit
  zone: number
  priceCents: number
}

export interface Order {
  id: number
  analysisId: number
  orderNumber: string
  destZip: string
  destZip3: string
  actualWeightLbs: number
  height: number | null
  width: number | null
  length: number | null
  state: string | null
}

export interface OrderResult {
  orderId: number
  warehouseId: number
  zone: number
  billableWeightValue: number
  billableWeightUnit: WeightUnit
  dimWeightLbs: number | null
  rateCardId: number
  baseCostCents: number
  surchargeCents: number
  totalCostCents: number
  calculationNotes: string | null
}

export interface ExcludedOrder {
  orderId: number
  warehouseId: number | null
  reason: string
  details: string | null
}

// ─── Engine input types ────────────────────────────────────────────────────────

export interface RateCardWithEntries {
  rateCard: RateCard
  entries: RateCardEntry[]
}

export interface WarehouseInput {
  warehouse: Warehouse
  // destZip3 → zone for this warehouse's origin_zip3
  zoneMaps: Map<string, number>
  // v1: exactly one card per warehouse is typical, but engine tolerates many
  // by picking the cheapest rate card per order per warehouse.
  rateCards: RateCardWithEntries[]
}

export interface EngineInput {
  orders: Order[]
  warehouses: WarehouseInput[]
}

// ─── Engine output types ───────────────────────────────────────────────────────

export interface WarehouseSummary {
  warehouseId: number
  providerName: string
  locationLabel: string
  originZip3: string
  orderCount: number
  totalCostCents: number
  avgCostCents: number
  avgZone: number
  zoneDistribution: Record<number, number>
  avgCostByZone: Record<number, number>
}

export interface OptimizedWinner {
  orderId: number
  winningWarehouseId: number
  winningCostCents: number
  winningZone: number
}

export interface ProviderOptimizedSummary {
  providerName: string
  includedWarehouseIds: number[]
  totalWarehouseCount: number
  orderCount: number
  totalCostCents: number
  avgCostCents: number
  avgZone: number
  // warehouseId → fraction of winning orders (0..1). Excluded warehouses: 0.
  nodeUtilization: Record<number, number>
  winners: OptimizedWinner[]
}

export interface EngineOutput {
  orderResults: OrderResult[]
  warehouseSummaries: WarehouseSummary[]
  excludedOrders: ExcludedOrder[]
  includedOrderIds: number[]
  warnings: string[]
}

// ─── Parser types ──────────────────────────────────────────────────────────────

export interface ParsedRateCardRow {
  weight_value: number
  weight_unit: WeightUnit
  zone_1?: number
  zone_2?: number
  zone_3?: number
  zone_4?: number
  zone_5?: number
  zone_6?: number
  zone_7?: number
  zone_8?: number
}
