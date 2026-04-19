export type WeightUnitMode = 'oz_only' | 'lbs_only' | 'oz_then_lbs'
export type WeightUnit = 'oz' | 'lbs'
export type AnalysisStatus = 'draft' | 'complete'

export interface Tpl {
  id: number
  analysisId: number
  name: string
  multiNodeEnabled: boolean
  dimWeightEnabled: boolean
  dimFactor: number | null
  surchargeFlatCents: number
  notes: string | null
  createdAt: string
}

export interface Location {
  id: number
  tplId: number
  name: string
  originZip: string
  originZip3: string
  createdAt: string
}

export interface RateCard {
  id: number
  tplId: number
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
  locationId: number
  tplId: number
  zone: number | null
  billableWeightValue: number | null
  billableWeightUnit: WeightUnit | null
  dimWeightLbs: number | null
  rateCardId: number | null
  baseCostCents: number | null
  surchargeCents: number | null
  totalCostCents: number | null
  isValid: boolean
  errorReason: string | null
  calculationNotes: string | null
}

export interface OrderBestResult {
  id: number
  orderId: number
  tplId: number
  bestLocationId: number
  bestRateCardId: number
  bestTotalCostCents: number
}

// ─── Engine input types ────────────────────────────────────────────────────────

export interface RateCardWithEntries {
  rateCard: RateCard
  entries: RateCardEntry[]
}

export interface LocationInput {
  location: Location
  zoneMaps: Map<string, number> // destZip3 → zone for this location's origin_zip3
}

export interface TplInput {
  tpl: Tpl
  locations: LocationInput[]
  rateCards: RateCardWithEntries[]
}

export interface EngineInput {
  orders: Order[]
  tpls: TplInput[]
}

// ─── Engine output types ───────────────────────────────────────────────────────

export interface LocationSummary {
  locationId: number
  locationName: string
  originZip3: string
  orderCount: number
  totalCostCents: number
  avgCostCents: number
  zoneDistribution: Record<number, number>
}

export interface TplSummary {
  tplId: number
  tplName: string
  multiNodeEnabled: boolean
  orderCount: number
  totalCostCents: number
  avgCostCents: number
  zoneDistribution: Record<number, number>
  avgCostByZone: Record<number, number>
  locationSummaries: LocationSummary[]
}

export interface EngineOutput {
  orderResults: OrderResult[]
  orderBestResults: Array<Omit<OrderBestResult, 'id'>>
  tplSummaries: TplSummary[]
  includedOrderIds: number[]
  excludedOrders: Array<{ orderId: number; orderNumber: string; reason: string }>
  warnings: string[]
}

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
