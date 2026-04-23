import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import type { NextResponse } from 'next/server'
import { createTestDb, applyMigrations, resetAnalysisTables, seedZoneMaps, makeCtx, jsonRequest } from './setup'

type Routes = {
  analysesList: typeof import('../../app/api/analyses/route')
  analysisWarehouses: typeof import('../../app/api/analyses/[id]/warehouses/route')
  analysisCalculate: typeof import('../../app/api/analyses/[id]/calculate/route')
  analysisResults: typeof import('../../app/api/analyses/[id]/results/route')
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

beforeAll(async () => {
  await applyMigrations()
  routes = {
    analysesList: await import('../../app/api/analyses/route'),
    analysisWarehouses: await import('../../app/api/analyses/[id]/warehouses/route'),
    analysisCalculate: await import('../../app/api/analyses/[id]/calculate/route'),
    analysisResults: await import('../../app/api/analyses/[id]/results/route'),
  }
})

afterAll(() => handle.cleanup())
beforeEach(async () => {
  await resetAnalysisTables()
})

async function createAnalysis(name = 'RouteTest'): Promise<number> {
  const resp = await routes.analysesList.POST(
    asNextReq(jsonRequest('http://x/', 'POST', { name })),
  )
  return (await json(resp)).id
}

async function createWarehouse(analysisId: number, overrides: Record<string, unknown> = {}) {
  const resp = await routes.analysisWarehouses.POST(
    asNextReq(
      jsonRequest('http://x/', 'POST', {
        provider_name: 'Kase',
        location_label: 'Milwaukee, WI',
        origin_zip: '53154',
        dim_weight_enabled: false,
        surcharge_flat_cents: 0,
        ...overrides,
      }),
    ),
    makeCtx({ id: String(analysisId) }),
  )
  return (await json(resp)).id
}

describe('GET /api/analyses/[id]/results', () => {
  it('returns 409 NOT_CALCULATED on a draft analysis', async () => {
    const id = await createAnalysis()
    const resp = await routes.analysisResults.GET(
      new Request('http://x/') as unknown as NextRequest,
      makeCtx({ id: String(id) }),
    )
    expect(resp.status).toBe(409)
    const body = await json(resp)
    expect(body.error.code).toBe('NOT_CALCULATED')
  })

  it('returns 404 when the analysis does not exist', async () => {
    const resp = await routes.analysisResults.GET(
      new Request('http://x/') as unknown as NextRequest,
      makeCtx({ id: '99999' }),
    )
    expect(resp.status).toBe(404)
  })

  it('happy path: returns the full matrix after calculate', async () => {
    const aid = await createAnalysis('matrix-test')
    const wid = await createWarehouse(aid)

    await seedZoneMaps([
      { originZip3: '531', destZip3: '040', zone: 5 },
      { originZip3: '531', destZip3: '770', zone: 6 },
    ])
    const { db } = await import('@/lib/db')
    const { rateCards, rateCardEntries, orders } = await import('@/lib/db/schema')
    const [rc] = db
      .insert(rateCards)
      .values({ warehouseId: wid, name: 'rc', weightUnitMode: 'oz_only' })
      .returning()
      .all()
    db.insert(rateCardEntries)
      .values([
        { rateCardId: rc.id, weightValue: 16, weightUnit: 'oz', zone: 5, priceCents: 500 },
        { rateCardId: rc.id, weightValue: 16, weightUnit: 'oz', zone: 6, priceCents: 600 },
      ])
      .run()
    db.insert(orders)
      .values([
        {
          analysisId: aid,
          orderNumber: 'A',
          destZip: '04021',
          destZip3: '040',
          actualWeightLbs: 0.5,
          height: null, width: null, length: null, state: null,
        },
        {
          analysisId: aid,
          orderNumber: 'B',
          destZip: '77077',
          destZip3: '770',
          actualWeightLbs: 0.5,
          height: null, width: null, length: null, state: null,
        },
      ])
      .run()

    // Run calculate
    await routes.analysisCalculate.POST(
      new Request('http://x/', { method: 'POST' }) as unknown as NextRequest,
      makeCtx({ id: String(aid) }),
    )

    const resp = await routes.analysisResults.GET(
      new Request('http://x/') as unknown as NextRequest,
      makeCtx({ id: String(aid) }),
    )
    expect(resp.status).toBe(200)
    const body = await json(resp)
    expect(body.analysis.id).toBe(aid)
    expect(body.warehouses).toHaveLength(1)
    expect(body.warehouses[0].provider_name).toBe('Kase')
    expect(body.orders_included_count).toBe(2)
    expect(body.orders_excluded_count).toBe(0)
    expect(body.matrix).toHaveLength(2)
    expect(body.matrix[0].results[0]).toMatchObject({
      warehouse_id: wid,
      zone: expect.any(Number),
      total_cost_cents: expect.any(Number),
    })
  })
})
