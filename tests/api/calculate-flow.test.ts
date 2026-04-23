/**
 * Integration test: full calculate flow via API routes.
 * Uses the 6-order sample from AGENTS.md to verify the pipeline end-to-end.
 * Expected costs come from the known-good spreadsheet values.
 */
import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import type { NextResponse } from 'next/server'
import {
  createTestDb,
  applyMigrations,
  resetAnalysisTables,
  seedZoneMaps,
  makeCtx,
  jsonRequest,
  multipartRequest,
} from './setup'

type Routes = {
  analysesList: typeof import('../../app/api/analyses/route')
  analysisById: typeof import('../../app/api/analyses/[id]/route')
  analysisWarehouses: typeof import('../../app/api/analyses/[id]/warehouses/route')
  warehouseRateCards: typeof import('../../app/api/warehouses/[id]/rate-cards/route')
  analysisOrders: typeof import('../../app/api/analyses/[id]/orders/route')
  analysisCalculate: typeof import('../../app/api/analyses/[id]/calculate/route')
  analysisExcluded: typeof import('../../app/api/analyses/[id]/excluded-orders/route')
}

let routes: Routes
const handle = createTestDb()

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function json(resp: Response | NextResponse): Promise<any> {
  return await resp.json()
}

function asNextReq(req: Request): NextRequest {
  return req as unknown as NextRequest
}

// The 6-order sample from AGENTS.md, in CSV format matching Sample Order Data headers
const SAMPLE_ORDERS_CSV = [
  'New Order Number,Actual Weight,Height,Width,Length,Dims,State,Postal Code',
  '0001,0.39,3.5,5.75,6,,ME,04021',
  '0002,0.937,5,5,12,,TX,77077',
  '0004,2.795,9,12,12,,CO,80908',
  '0005,0.743,4,6,8,,AZ,85387',
  '0007,1.001,5,6,11,,WI,54011',
  '0008,0.981,4,8,10,,MI,49505',
].join('\n')

// Atomix Ground rate card — oz_then_lbs, same as AGENTS.md validation data
const ATOMIX_RATE_CARD_CSV = [
  ',Oz,1,2,3,4,5,6,7,8',
  ',1,4.19,4.26,4.28,4.39,4.45,4.55,4.64,4.83',
  ',2,4.19,4.26,4.28,4.39,4.45,4.55,4.64,4.83',
  ',3,4.19,4.26,4.28,4.39,4.45,4.55,4.64,4.83',
  ',4,4.19,4.26,4.28,4.39,4.45,4.55,4.64,4.83',
  ',5,4.19,4.26,4.28,4.39,4.45,4.55,4.64,4.83',
  ',6,4.19,4.26,4.28,4.39,4.45,4.55,4.64,4.83',
  ',7,4.19,4.26,4.28,4.39,4.57,4.55,4.64,4.83',
  ',8,4.25,4.33,4.35,4.47,4.54,4.63,4.72,4.91',
  ',9,4.33,4.40,4.43,4.55,4.63,4.72,4.82,5.01',
  ',10,4.40,4.48,4.51,4.64,4.72,4.82,4.93,5.13',
  ',11,4.48,4.56,4.59,4.72,4.81,4.92,5.03,5.24',
  ',12,4.57,4.65,4.68,4.82,4.90,5.00,5.98,5.35',
  ',13,4.65,4.73,4.77,4.91,4.99,5.11,5.22,5.45',
  ',14,4.74,4.82,4.86,5.01,5.09,5.20,5.33,5.55',
  ',15,4.82,4.91,4.95,5.10,5.19,6.29,5.43,5.66',
  ',16,5.66,5.72,5.84,6.14,6.66,6.81,7.00,7.29',
  ',LB,,,,,,,,',
  ',1,5.36,5.42,5.52,5.80,6.31,6.50,7.77,8.25',
  ',2,5.48,5.58,5.68,6.09,6.75,7.12,8.20,8.35',
  ',3,5.60,5.70,5.80,6.38,7.30,7.56,8.63,8.45',
  ',4,5.73,5.83,5.93,6.69,7.80,8.01,9.09,9.55',
  ',5,5.87,5.97,6.08,7.01,8.30,8.49,9.45,10.65',
  ',6,6.01,6.12,6.23,7.33,8.83,8.96,9.85,11.76',
  ',7,6.15,6.27,6.38,7.59,9.36,9.47,10.27,12.88',
].join('\n')

// Zone data required for the 6 orders (origin: 531 = Milwaukee ZIP3)
const ZONE_MAPS = [
  { originZip3: '531', destZip3: '040', zone: 5 }, // 04021 ME → zone 5
  { originZip3: '531', destZip3: '770', zone: 6 }, // 77077 TX → zone 6
  { originZip3: '531', destZip3: '809', zone: 5 }, // 80908 CO → zone 5
  { originZip3: '531', destZip3: '853', zone: 7 }, // 85387 AZ → zone 7
  { originZip3: '531', destZip3: '540', zone: 3 }, // 54011 WI → zone 3
  { originZip3: '531', destZip3: '495', zone: 2 }, // 49505 MI → zone 2
]

const ORDER_MAPPING = {
  order_number: 'New Order Number',
  dest_zip: 'Postal Code',
  weight: 'Actual Weight',
  weight_unit: 'lbs',
  height: 'Height',
  width: 'Width',
  length: 'Length',
  state: 'State',
}

beforeAll(async () => {
  await applyMigrations()
  await seedZoneMaps(ZONE_MAPS)
  routes = {
    analysesList: await import('../../app/api/analyses/route'),
    analysisById: await import('../../app/api/analyses/[id]/route'),
    analysisWarehouses: await import('../../app/api/analyses/[id]/warehouses/route'),
    warehouseRateCards: await import('../../app/api/warehouses/[id]/rate-cards/route'),
    analysisOrders: await import('../../app/api/analyses/[id]/orders/route'),
    analysisCalculate: await import('../../app/api/analyses/[id]/calculate/route'),
    analysisExcluded: await import('../../app/api/analyses/[id]/excluded-orders/route'),
  }
})

afterAll(() => handle.cleanup())
beforeEach(async () => { await resetAnalysisTables() })

describe('calculate flow: Kase/Milwaukee + Atomix Ground', () => {
  async function setup() {
    // 1. Create analysis
    const aResp = await routes.analysesList.POST(
      asNextReq(jsonRequest('http://x/', 'POST', { name: 'Calculate Test' })),
    )
    const { id: analysisId } = await json(aResp)

    // 2. Create warehouse
    const whResp = await routes.analysisWarehouses.POST(
      asNextReq(
        jsonRequest('http://x/', 'POST', {
          provider_name: 'Kase',
          location_label: 'Milwaukee, WI',
          origin_zip: '53154',
        }),
      ),
      makeCtx({ id: String(analysisId) }),
    )
    const { id: warehouseId } = await json(whResp)
    expect(whResp.status).toBe(201)

    // 3. Upload rate card
    const rcResp = await routes.warehouseRateCards.POST(
      asNextReq(
        multipartRequest(
          'http://x/',
          { name: 'rc.csv', contentType: 'text/csv', data: ATOMIX_RATE_CARD_CSV },
          { name: 'Atomix Ground', weight_unit_mode: 'oz_then_lbs' },
        ),
      ),
      makeCtx({ id: String(warehouseId) }),
    )
    expect(rcResp.status).toBe(201)

    // 4. Upload orders
    const ordResp = await routes.analysisOrders.POST(
      asNextReq(
        multipartRequest(
          'http://x/',
          { name: 'orders.csv', contentType: 'text/csv', data: SAMPLE_ORDERS_CSV },
          { mapping: JSON.stringify(ORDER_MAPPING) },
        ),
      ),
      makeCtx({ id: String(analysisId) }),
    )
    expect(ordResp.status).toBe(200)
    const ordBody = await json(ordResp)
    expect(ordBody.imported).toBe(6)
    expect(ordBody.failed).toBe(0)

    return { analysisId, warehouseId }
  }

  it('calculates successfully and flips analysis status to complete', async () => {
    const { analysisId } = await setup()

    const calcResp = await routes.analysisCalculate.POST(
      asNextReq(new Request('http://x/', { method: 'POST' })),
      makeCtx({ id: String(analysisId) }),
    )
    expect(calcResp.status).toBe(200)
    const calcBody = await json(calcResp)
    expect(calcBody.included_count).toBe(6)
    expect(calcBody.excluded_count).toBe(0)

    // Verify status updated
    const getResp = await routes.analysisById.GET(
      asNextReq(new Request('http://x/', { method: 'GET' })),
      makeCtx({ id: String(analysisId) }),
    )
    const analysis = await json(getResp)
    expect(analysis.status).toBe('complete')
  })

  it('produces correct costs matching AGENTS.md validation data', async () => {
    const { analysisId, warehouseId } = await setup()

    await routes.analysisCalculate.POST(
      asNextReq(new Request('http://x/', { method: 'POST' })),
      makeCtx({ id: String(analysisId) }),
    )

    const { db } = await import('@/lib/db')
    const { orderResults, orders } = await import('@/lib/db/schema')
    const { eq } = await import('drizzle-orm')

    const results = db
      .select({ orderNumber: orders.orderNumber, totalCostCents: orderResults.totalCostCents, zone: orderResults.zone, billableWeightValue: orderResults.billableWeightValue, billableWeightUnit: orderResults.billableWeightUnit })
      .from(orderResults)
      .innerJoin(orders, eq(orders.id, orderResults.orderId))
      .where(eq(orderResults.warehouseId, warehouseId))
      .all()

    const byOrder = Object.fromEntries(results.map((r) => [r.orderNumber, r]))

    // AGENTS.md known-good values
    expect(byOrder['0001'].zone).toBe(5)
    expect(byOrder['0001'].billableWeightValue).toBe(7)
    expect(byOrder['0001'].billableWeightUnit).toBe('oz')
    expect(byOrder['0001'].totalCostCents).toBe(457)

    expect(byOrder['0002'].zone).toBe(6)
    expect(byOrder['0002'].billableWeightValue).toBe(15)
    expect(byOrder['0002'].billableWeightUnit).toBe('oz')
    expect(byOrder['0002'].totalCostCents).toBe(629)

    expect(byOrder['0004'].zone).toBe(5)
    expect(byOrder['0004'].billableWeightValue).toBe(3)
    expect(byOrder['0004'].billableWeightUnit).toBe('lbs')
    expect(byOrder['0004'].totalCostCents).toBe(730)

    expect(byOrder['0005'].zone).toBe(7)
    expect(byOrder['0005'].billableWeightValue).toBe(12)
    expect(byOrder['0005'].billableWeightUnit).toBe('oz')
    expect(byOrder['0005'].totalCostCents).toBe(598)

    expect(byOrder['0007'].zone).toBe(3)
    expect(byOrder['0007'].billableWeightValue).toBe(2)
    expect(byOrder['0007'].billableWeightUnit).toBe('lbs')
    expect(byOrder['0007'].totalCostCents).toBe(568)

    expect(byOrder['0008'].zone).toBe(2)
    expect(byOrder['0008'].billableWeightValue).toBe(16)
    expect(byOrder['0008'].billableWeightUnit).toBe('oz')
    expect(byOrder['0008'].totalCostCents).toBe(572)
  })

  it('excluded-orders endpoint returns empty for clean dataset', async () => {
    const { analysisId } = await setup()
    await routes.analysisCalculate.POST(
      asNextReq(new Request('http://x/', { method: 'POST' })),
      makeCtx({ id: String(analysisId) }),
    )

    const excResp = await routes.analysisExcluded.GET(
      asNextReq(new Request('http://x/', { method: 'GET' })),
      makeCtx({ id: String(analysisId) }),
    )
    expect(excResp.status).toBe(200)
    const excBody = await json(excResp)
    expect(excBody.rows).toHaveLength(0)
  })

  it('re-running calculate overwrites previous results', async () => {
    const { analysisId, warehouseId } = await setup()

    await routes.analysisCalculate.POST(
      asNextReq(new Request('http://x/', { method: 'POST' })),
      makeCtx({ id: String(analysisId) }),
    )
    await routes.analysisCalculate.POST(
      asNextReq(new Request('http://x/', { method: 'POST' })),
      makeCtx({ id: String(analysisId) }),
    )

    const { db } = await import('@/lib/db')
    const { orderResults } = await import('@/lib/db/schema')
    const { eq } = await import('drizzle-orm')
    const rows = db.select().from(orderResults).where(eq(orderResults.warehouseId, warehouseId)).all()
    // Should still be exactly 6 rows, not 12
    expect(rows.length).toBe(6)
  })
})
