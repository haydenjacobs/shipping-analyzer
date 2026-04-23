/**
 * Tests for share link API routes:
 *   POST   /api/analyses/[id]/share
 *   DELETE /api/analyses/[id]/share
 *   GET    /api/share/[token]
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
} from './setup'

type Routes = {
  analysesList: typeof import('../../app/api/analyses/route')
  analysisWarehouses: typeof import('../../app/api/analyses/[id]/warehouses/route')
  analysisShare: typeof import('../../app/api/analyses/[id]/share/route')
  analysisCalculate: typeof import('../../app/api/analyses/[id]/calculate/route')
  shareToken: typeof import('../../app/api/share/[token]/route')
  analysisResults: typeof import('../../app/api/analyses/[id]/results/route')
}

let routes: Routes
const handle = createTestDb()

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function json(resp: Response | NextResponse): Promise<any> {
  return resp.json()
}

function asNextReq(req: Request): NextRequest {
  return req as unknown as NextRequest
}

beforeAll(async () => {
  await applyMigrations()
  routes = {
    analysesList: await import('../../app/api/analyses/route'),
    analysisWarehouses: await import('../../app/api/analyses/[id]/warehouses/route'),
    analysisShare: await import('../../app/api/analyses/[id]/share/route'),
    analysisCalculate: await import('../../app/api/analyses/[id]/calculate/route'),
    shareToken: await import('../../app/api/share/[token]/route'),
    analysisResults: await import('../../app/api/analyses/[id]/results/route'),
  }
})

afterAll(() => handle.cleanup())
beforeEach(async () => {
  await resetAnalysisTables()
})

async function createAnalysis(name = 'Test'): Promise<number> {
  const resp = await routes.analysesList.POST(
    asNextReq(jsonRequest('http://localhost/', 'POST', { name })),
  )
  return (await json(resp)).id
}

async function createWarehouse(analysisId: number): Promise<number> {
  const resp = await routes.analysisWarehouses.POST(
    asNextReq(
      jsonRequest('http://localhost/', 'POST', {
        provider_name: 'Kase',
        location_label: 'Milwaukee, WI',
        origin_zip: '53154',
        dim_weight_enabled: false,
        surcharge_flat_cents: 0,
      }),
    ),
    makeCtx({ id: String(analysisId) }),
  )
  return (await json(resp)).id
}

async function runCalculate(analysisId: number) {
  return routes.analysisCalculate.POST(
    asNextReq(new Request('http://localhost/', { method: 'POST' })),
    makeCtx({ id: String(analysisId) }),
  )
}

async function setupCalculatedAnalysis(): Promise<{ analysisId: number; warehouseId: number }> {
  const analysisId = await createAnalysis('Calculated')
  const warehouseId = await createWarehouse(analysisId)

  await seedZoneMaps([{ originZip3: '531', destZip3: '040', zone: 5 }])

  const { db } = await import('@/lib/db')
  const { rateCards, rateCardEntries, orders } = await import('@/lib/db/schema')

  const [rc] = db
    .insert(rateCards)
    .values({ warehouseId, name: 'rc', weightUnitMode: 'oz_only' })
    .returning()
    .all()

  db.insert(rateCardEntries)
    .values([{ rateCardId: rc.id, weightValue: 16, weightUnit: 'oz', zone: 5, priceCents: 500 }])
    .run()

  db.insert(orders)
    .values([
      {
        analysisId,
        orderNumber: 'A',
        destZip: '04021',
        destZip3: '040',
        actualWeightLbs: 0.5,
        height: null,
        width: null,
        length: null,
        state: null,
      },
    ])
    .run()

  await runCalculate(analysisId)
  return { analysisId, warehouseId }
}

// ─── POST /api/analyses/[id]/share ─────────────────────────────────────────

describe('POST /api/analyses/[id]/share', () => {
  it('generates a token for a valid analysis', async () => {
    const id = await createAnalysis()
    const resp = await routes.analysisShare.POST(
      asNextReq(new Request('http://localhost/', { method: 'POST' })),
      makeCtx({ id: String(id) }),
    )
    expect(resp.status).toBe(200)
    const body = await json(resp)
    expect(typeof body.token).toBe('string')
    expect(body.token).toHaveLength(36) // UUID v4
    expect(body.url).toContain('/share/')
    expect(body.url).toContain(body.token)
  })

  it('persists the token to the database', async () => {
    const id = await createAnalysis()
    const resp = await routes.analysisShare.POST(
      asNextReq(new Request('http://localhost/', { method: 'POST' })),
      makeCtx({ id: String(id) }),
    )
    const { token } = await json(resp)

    // Verify it's stored in DB
    const { db } = await import('@/lib/db')
    const { analyses } = await import('@/lib/db/schema')
    const { eq } = await import('drizzle-orm')
    const row = db.select().from(analyses).where(eq(analyses.id, id)).get()
    expect(row?.shareableToken).toBe(token)
  })

  it('regenerates token when called again — old token is revoked', async () => {
    const id = await createAnalysis()

    const r1 = await routes.analysisShare.POST(
      asNextReq(new Request('http://localhost/', { method: 'POST' })),
      makeCtx({ id: String(id) }),
    )
    const { token: token1 } = await json(r1)

    const r2 = await routes.analysisShare.POST(
      asNextReq(new Request('http://localhost/', { method: 'POST' })),
      makeCtx({ id: String(id) }),
    )
    const { token: token2 } = await json(r2)

    expect(token2).not.toBe(token1)

    // Old token is gone from DB
    const { db } = await import('@/lib/db')
    const { analyses } = await import('@/lib/db/schema')
    const { eq } = await import('drizzle-orm')
    const row = db.select().from(analyses).where(eq(analyses.id, id)).get()
    expect(row?.shareableToken).toBe(token2)
  })

  it('returns 404 for a non-existent analysis', async () => {
    const resp = await routes.analysisShare.POST(
      asNextReq(new Request('http://localhost/', { method: 'POST' })),
      makeCtx({ id: '99999' }),
    )
    expect(resp.status).toBe(404)
  })

  it('returns 400 for an invalid id', async () => {
    const resp = await routes.analysisShare.POST(
      asNextReq(new Request('http://localhost/', { method: 'POST' })),
      makeCtx({ id: 'abc' }),
    )
    expect(resp.status).toBe(400)
  })
})

// ─── DELETE /api/analyses/[id]/share ───────────────────────────────────────

describe('DELETE /api/analyses/[id]/share', () => {
  it('sets shareable_token to null', async () => {
    const id = await createAnalysis()

    // First generate a token
    await routes.analysisShare.POST(
      asNextReq(new Request('http://localhost/', { method: 'POST' })),
      makeCtx({ id: String(id) }),
    )

    // Revoke it
    const resp = await routes.analysisShare.DELETE(
      asNextReq(new Request('http://localhost/', { method: 'DELETE' })),
      makeCtx({ id: String(id) }),
    )
    expect(resp.status).toBe(200)
    const body = await json(resp)
    expect(body.revoked).toBe(true)

    // Confirm null in DB
    const { db } = await import('@/lib/db')
    const { analyses } = await import('@/lib/db/schema')
    const { eq } = await import('drizzle-orm')
    const row = db.select().from(analyses).where(eq(analyses.id, id)).get()
    expect(row?.shareableToken).toBeNull()
  })

  it('returns 404 for a non-existent analysis', async () => {
    const resp = await routes.analysisShare.DELETE(
      asNextReq(new Request('http://localhost/', { method: 'DELETE' })),
      makeCtx({ id: '99999' }),
    )
    expect(resp.status).toBe(404)
  })
})

// ─── GET /api/share/[token] ─────────────────────────────────────────────────

describe('GET /api/share/[token]', () => {
  it('returns 404 for an unknown token', async () => {
    const resp = await routes.shareToken.GET(
      asNextReq(new Request('http://localhost/')),
      makeCtx({ token: 'not-a-real-token' }),
    )
    expect(resp.status).toBe(404)
  })

  it('returns 409 for a valid token on a non-calculated analysis', async () => {
    const id = await createAnalysis()

    const shareResp = await routes.analysisShare.POST(
      asNextReq(new Request('http://localhost/', { method: 'POST' })),
      makeCtx({ id: String(id) }),
    )
    const { token } = await json(shareResp)

    const resp = await routes.shareToken.GET(
      asNextReq(new Request('http://localhost/')),
      makeCtx({ token }),
    )
    expect(resp.status).toBe(409)
  })

  it('returns 404 after the token is revoked', async () => {
    const id = await createAnalysis()

    const shareResp = await routes.analysisShare.POST(
      asNextReq(new Request('http://localhost/', { method: 'POST' })),
      makeCtx({ id: String(id) }),
    )
    const { token } = await json(shareResp)

    // Revoke
    await routes.analysisShare.DELETE(
      asNextReq(new Request('http://localhost/', { method: 'DELETE' })),
      makeCtx({ id: String(id) }),
    )

    // Old token is now 404
    const resp = await routes.shareToken.GET(
      asNextReq(new Request('http://localhost/')),
      makeCtx({ token }),
    )
    expect(resp.status).toBe(404)
  })

  it('returns the results payload for a valid token on a calculated analysis', async () => {
    const { analysisId } = await setupCalculatedAnalysis()

    const shareResp = await routes.analysisShare.POST(
      asNextReq(new Request('http://localhost/', { method: 'POST' })),
      makeCtx({ id: String(analysisId) }),
    )
    const { token } = await json(shareResp)

    const resp = await routes.shareToken.GET(
      asNextReq(new Request('http://localhost/')),
      makeCtx({ token }),
    )
    expect(resp.status).toBe(200)
    const body = await json(resp)
    expect(body.analysis.id).toBe(analysisId)
    expect(body.warehouses).toHaveLength(1)
    expect(body.matrix).toHaveLength(1)
    expect(body.orders_included_count).toBe(1)
    // shareableToken must be in the response so share page can show it
    expect(typeof body.analysis.shareableToken).toBe('string')
  })

  it('returned payload is identical shape to the results route', async () => {
    const { analysisId } = await setupCalculatedAnalysis()

    const shareResp = await routes.analysisShare.POST(
      asNextReq(new Request('http://localhost/', { method: 'POST' })),
      makeCtx({ id: String(analysisId) }),
    )
    const { token } = await json(shareResp)

    const [shareBody, resultsBody] = await Promise.all([
      routes.shareToken.GET(asNextReq(new Request('http://localhost/')), makeCtx({ token }))
        .then((r) => json(r)),
      routes.analysisResults.GET(
        asNextReq(new Request('http://localhost/')),
        makeCtx({ id: String(analysisId) }),
      ).then((r) => json(r)),
    ])

    expect(shareBody.orders_included_count).toBe(resultsBody.orders_included_count)
    expect(shareBody.warehouses).toHaveLength(resultsBody.warehouses.length)
    expect(shareBody.matrix).toHaveLength(resultsBody.matrix.length)
  })
})
