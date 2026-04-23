/**
 * API route tests. All DB-touching imports are dynamic so that the
 * SHIPPING_ANALYZER_DB_PATH env var is set before lib/db is evaluated.
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
  warehouseById: typeof import('../../app/api/warehouses/[id]/route')
  warehouseRateCards: typeof import('../../app/api/warehouses/[id]/rate-cards/route')
  rateCardById: typeof import('../../app/api/rate-cards/[id]/route')
  analysisOrders: typeof import('../../app/api/analyses/[id]/orders/route')
  analysisCalculate: typeof import('../../app/api/analyses/[id]/calculate/route')
  analysisExcluded: typeof import('../../app/api/analyses/[id]/excluded-orders/route')
}

let routes: Routes
const handle = createTestDb()

// Test helper: loose-typed JSON body reader. Test assertions drill into nested
// shapes, and enforcing precise types here would duplicate route shapes.
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
    analysisById: await import('../../app/api/analyses/[id]/route'),
    analysisWarehouses: await import('../../app/api/analyses/[id]/warehouses/route'),
    warehouseById: await import('../../app/api/warehouses/[id]/route'),
    warehouseRateCards: await import('../../app/api/warehouses/[id]/rate-cards/route'),
    rateCardById: await import('../../app/api/rate-cards/[id]/route'),
    analysisOrders: await import('../../app/api/analyses/[id]/orders/route'),
    analysisCalculate: await import('../../app/api/analyses/[id]/calculate/route'),
    analysisExcluded: await import('../../app/api/analyses/[id]/excluded-orders/route'),
  }
})

afterAll(() => handle.cleanup())

beforeEach(async () => {
  await resetAnalysisTables()
})

async function createAnalysis(name = 'Test A'): Promise<number> {
  const resp = await routes.analysesList.POST(
    asNextReq(jsonRequest('http://x/api/analyses', 'POST', { name })),
  )
  const body = await json(resp)
  return body.id
}

async function createWarehouse(
  analysisId: number,
  overrides: Record<string, unknown> = {},
): Promise<number> {
  const resp = await routes.analysisWarehouses.POST(
    asNextReq(
      jsonRequest(`http://x/api/analyses/${analysisId}/warehouses`, 'POST', {
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
  const body = await json(resp)
  return body.id
}

// ─── Analyses ───────────────────────────────────────────────────────────────────

describe('analyses', () => {
  it('creates, lists, and deletes', async () => {
    const id = await createAnalysis('A1')
    expect(id).toBeGreaterThan(0)

    const listResp = await routes.analysesList.GET()
    const list = await json(listResp)
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('A1')
    expect(list[0].warehouseCount).toBe(0)
    expect(list[0].orderCount).toBe(0)

    const delResp = await routes.analysisById.DELETE(
      new Request('http://x/api/analyses/' + id) as unknown as NextRequest,
      makeCtx({ id: String(id) }),
    )
    expect(delResp.status).toBe(200)

    const listAfter = await json(await routes.analysesList.GET())
    expect(listAfter).toHaveLength(0)
  })

  it('PATCH updates each field individually and rejects unknown fields', async () => {
    const id = await createAnalysis('orig')

    async function patch(body: unknown) {
      return await routes.analysisById.PATCH(
        asNextReq(jsonRequest('http://x/p', 'PATCH', body)),
        makeCtx({ id: String(id) }),
      )
    }

    // name
    let r = await patch({ name: 'renamed' })
    expect(r.status).toBe(200)
    let b = await json(r)
    expect(b.name).toBe('renamed')

    // view_mode
    r = await patch({ view_mode: 'single_node' })
    b = await json(r)
    expect(b.viewMode).toBe('single_node')

    // excluded_locations
    r = await patch({ excluded_locations: [1, 2, 3] })
    b = await json(r)
    expect(b.excludedLocations).toEqual([1, 2, 3])

    // projected_order_count + period
    r = await patch({ projected_order_count: 50000, projected_period: 'month' })
    b = await json(r)
    expect(b.projectedOrderCount).toBe(50000)
    expect(b.projectedPeriod).toBe('month')

    // status
    r = await patch({ status: 'complete' })
    b = await json(r)
    expect(b.status).toBe('complete')

    // invalid enum
    r = await patch({ view_mode: 'garbage' })
    expect(r.status).toBe(400)

    // unknown field
    r = await patch({ nonsense: 1 })
    expect(r.status).toBe(400)
  })

  it('DELETE cascades to warehouses and orders', async () => {
    const id = await createAnalysis('cascade')
    await createWarehouse(id)
    // Create an order by inserting via DB to avoid needing file upload here.
    const { db, sqlite } = await import('@/lib/db')
    const { orders } = await import('@/lib/db/schema')
    db.insert(orders)
      .values({
        analysisId: id,
        orderNumber: 'X1',
        destZip: '04021',
        destZip3: '040',
        actualWeightLbs: 1,
        height: null,
        width: null,
        length: null,
        state: null,
      })
      .run()

    await routes.analysisById.DELETE(
      new Request('http://x/') as unknown as NextRequest,
      makeCtx({ id: String(id) }),
    )
    const whCount = sqlite.prepare('SELECT COUNT(*) as n FROM warehouses').get() as { n: number }
    const orderCount = sqlite.prepare('SELECT COUNT(*) as n FROM orders').get() as { n: number }
    expect(whCount.n).toBe(0)
    expect(orderCount.n).toBe(0)
  })
})

// ─── Warehouses ─────────────────────────────────────────────────────────────────

describe('warehouses', () => {
  it('creates with zip left-padding and derives zip3', async () => {
    const id = await createAnalysis()
    const resp = await routes.analysisWarehouses.POST(
      asNextReq(
        jsonRequest('http://x/', 'POST', {
          provider_name: 'X',
          location_label: 'L',
          origin_zip: '5154', // should be left-padded to 05154
        }),
      ),
      makeCtx({ id: String(id) }),
    )
    const b = await json(resp)
    expect(resp.status).toBe(201)
    expect(b.originZip).toBe('05154')
    expect(b.originZip3).toBe('051')
  })

  it('rejects invalid zip', async () => {
    const id = await createAnalysis()
    const resp = await routes.analysisWarehouses.POST(
      asNextReq(
        jsonRequest('http://x/', 'POST', {
          provider_name: 'X',
          location_label: 'L',
          origin_zip: 'abcdef',
        }),
      ),
      makeCtx({ id: String(id) }),
    )
    expect(resp.status).toBe(400)
  })

  it('PATCH and DELETE cascade', async () => {
    const aid = await createAnalysis()
    const wid = await createWarehouse(aid)
    const { db } = await import('@/lib/db')
    const { rateCards } = await import('@/lib/db/schema')
    db.insert(rateCards)
      .values({ warehouseId: wid, name: 'rc', weightUnitMode: 'lbs_only' })
      .run()

    const patchResp = await routes.warehouseById.PATCH(
      asNextReq(jsonRequest('http://x/', 'PATCH', { surcharge_flat_cents: 250 })),
      makeCtx({ id: String(wid) }),
    )
    const b = await json(patchResp)
    expect(b.surchargeFlatCents).toBe(250)

    await routes.warehouseById.DELETE(
      new Request('http://x/') as unknown as NextRequest,
      makeCtx({ id: String(wid) }),
    )
    const { sqlite } = await import('@/lib/db')
    const rcCount = sqlite.prepare('SELECT COUNT(*) as n FROM rate_cards').get() as { n: number }
    expect(rcCount.n).toBe(0)
  })
})

// ─── Rate card upload ───────────────────────────────────────────────────────────

// Same shape as tests/fixtures/Sample Rate Card.csv — Oz section then LB section
// with a unit-label row acting as a separator. Matches what the rate card
// parser expects in its "file" input mode.
const VALID_RATE_CARD_CSV = [
  ',Oz,1,2,3,4,5,6,7,8',
  ',7,4.19,4.26,4.28,4.39,4.57,4.55,4.64,4.83',
  ',12,4.50,4.60,4.70,4.80,4.90,5.00,5.98,5.20',
  ',15,5.00,5.10,5.20,5.30,5.40,6.29,5.60,5.70',
  ',16,5.66,5.72,5.84,6.14,6.66,6.81,7.00,7.29',
  ',LB,,,,,,,,',
  ',2,5.48,5.58,5.68,5.80,6.31,6.50,7.77,8.25',
  ',3,5.60,5.70,5.80,5.90,7.30,7.12,8.20,8.35',
].join('\n')

describe('rate card upload', () => {
  it('accepts a valid CSV and persists entries', async () => {
    const aid = await createAnalysis()
    const wid = await createWarehouse(aid)

    const resp = await routes.warehouseRateCards.POST(
      asNextReq(
        multipartRequest(
          'http://x/',
          { name: 'card.csv', contentType: 'text/csv', data: VALID_RATE_CARD_CSV },
          { name: 'Atomix Ground', weight_unit_mode: 'oz_then_lbs' },
        ),
      ),
      makeCtx({ id: String(wid) }),
    )
    expect(resp.status).toBe(201)
    const b = await json(resp)
    expect(b.rateCard.id).toBeGreaterThan(0)
    expect(b.entryCount).toBeGreaterThan(0)
  })

  it('rolls back on parse error (no orphan rate_cards row)', async () => {
    const aid = await createAnalysis()
    const wid = await createWarehouse(aid)

    // No zone header row at all → parser returns error
    const bad = 'foo,bar\n1,2\n3,4\n'
    const resp = await routes.warehouseRateCards.POST(
      asNextReq(
        multipartRequest(
          'http://x/',
          { name: 'bad.csv', contentType: 'text/csv', data: bad },
          { name: 'Atomix Ground', weight_unit_mode: 'oz_then_lbs' },
        ),
      ),
      makeCtx({ id: String(wid) }),
    )
    expect(resp.status).toBe(400)
    const { sqlite } = await import('@/lib/db')
    const rc = sqlite.prepare('SELECT COUNT(*) as n FROM rate_cards').get() as { n: number }
    expect(rc.n).toBe(0)
  })

  it('requires name and weight_unit_mode', async () => {
    const aid = await createAnalysis()
    const wid = await createWarehouse(aid)
    const resp = await routes.warehouseRateCards.POST(
      asNextReq(
        multipartRequest('http://x/', {
          name: 'x.csv',
          contentType: 'text/csv',
          data: VALID_RATE_CARD_CSV,
        }),
      ),
      makeCtx({ id: String(wid) }),
    )
    expect(resp.status).toBe(400)
  })
})

// ─── Order upload ───────────────────────────────────────────────────────────────

describe('order upload', () => {
  it('left-pads ZIPs and converts oz → lbs', async () => {
    const aid = await createAnalysis()

    const csv = [
      'ord,zip,wt',
      '0001,4021,16', // zip "4021" → "04021", 16 oz → 1.0 lbs
      '0002,10001,32',
    ].join('\n')

    const resp = await routes.analysisOrders.POST(
      asNextReq(
        multipartRequest(
          'http://x/',
          { name: 'o.csv', contentType: 'text/csv', data: csv },
          {
            mapping: JSON.stringify({
              order_number: 'ord',
              dest_zip: 'zip',
              weight: 'wt',
              weight_unit: 'oz',
            }),
          },
        ),
      ),
      makeCtx({ id: String(aid) }),
    )
    expect(resp.status).toBe(200)
    const b = await json(resp)
    expect(b.imported).toBe(2)
    expect(b.failed).toBe(0)

    const { sqlite } = await import('@/lib/db')
    const rows = sqlite
      .prepare('SELECT order_number, dest_zip, actual_weight_lbs FROM orders ORDER BY id')
      .all() as Array<{ order_number: string; dest_zip: string; actual_weight_lbs: number }>
    expect(rows[0].dest_zip).toBe('04021')
    expect(rows[0].actual_weight_lbs).toBeCloseTo(1.0, 5)
    expect(rows[1].actual_weight_lbs).toBeCloseTo(2.0, 5)
  })

  it('reports partial failures without dropping valid rows silently', async () => {
    const aid = await createAnalysis()
    const csv = [
      'ord,zip,wt',
      '0001,04021,1.5',
      ',04022,1.5', // missing order number
      '0003,abcde,2.0', // invalid ZIP (non-numeric)
      '0004,04024,2.0',
    ].join('\n')

    const resp = await routes.analysisOrders.POST(
      asNextReq(
        multipartRequest(
          'http://x/',
          { name: 'o.csv', contentType: 'text/csv', data: csv },
          {
            mapping: JSON.stringify({
              order_number: 'ord',
              dest_zip: 'zip',
              weight: 'wt',
              weight_unit: 'lbs',
            }),
          },
        ),
      ),
      makeCtx({ id: String(aid) }),
    )
    const b = await json(resp)
    expect(b.imported).toBe(2)
    expect(b.failed).toBe(2)
    expect(b.failures).toHaveLength(2)
  })
})

// ─── Calculate ──────────────────────────────────────────────────────────────────

describe('calculate', () => {
  it('happy path: produces OrderResult rows matching sample data', async () => {
    const aid = await createAnalysis('Kase sample')
    const wid = await createWarehouse(aid)

    // Seed zone maps for origin 531 per the integration test.
    await seedZoneMaps([
      { originZip3: '531', destZip3: '040', zone: 5 },
      { originZip3: '531', destZip3: '770', zone: 6 },
      { originZip3: '531', destZip3: '809', zone: 5 },
      { originZip3: '531', destZip3: '853', zone: 7 },
      { originZip3: '531', destZip3: '540', zone: 3 },
      { originZip3: '531', destZip3: '495', zone: 2 },
    ])

    // Insert rate card + entries directly (faster than going through the upload).
    const { db } = await import('@/lib/db')
    const { rateCards, rateCardEntries } = await import('@/lib/db/schema')
    const [rc] = db
      .insert(rateCards)
      .values({ warehouseId: wid, name: 'Atomix Ground', weightUnitMode: 'oz_then_lbs' })
      .returning()
      .all()
    db.insert(rateCardEntries)
      .values([
        { rateCardId: rc.id, weightValue: 7,  weightUnit: 'oz',  zone: 5, priceCents: 457 },
        { rateCardId: rc.id, weightValue: 15, weightUnit: 'oz',  zone: 6, priceCents: 629 },
        { rateCardId: rc.id, weightValue: 12, weightUnit: 'oz',  zone: 7, priceCents: 598 },
        { rateCardId: rc.id, weightValue: 16, weightUnit: 'oz',  zone: 2, priceCents: 572 },
        { rateCardId: rc.id, weightValue: 3,  weightUnit: 'lbs', zone: 5, priceCents: 730 },
        { rateCardId: rc.id, weightValue: 2,  weightUnit: 'lbs', zone: 3, priceCents: 568 },
      ])
      .run()

    // Orders
    const { orders } = await import('@/lib/db/schema')
    db.insert(orders)
      .values([
        { analysisId: aid, orderNumber: '0001', destZip: '04021', destZip3: '040', actualWeightLbs: 0.39,  height: 6,  width: 5.75, length: 3.5, state: null },
        { analysisId: aid, orderNumber: '0002', destZip: '77077', destZip3: '770', actualWeightLbs: 0.937, height: 12, width: 5,    length: 5,   state: null },
        { analysisId: aid, orderNumber: '0004', destZip: '80908', destZip3: '809', actualWeightLbs: 2.795, height: 12, width: 12,   length: 9,   state: null },
        { analysisId: aid, orderNumber: '0005', destZip: '85387', destZip3: '853', actualWeightLbs: 0.743, height: 8,  width: 6,    length: 4,   state: null },
        { analysisId: aid, orderNumber: '0007', destZip: '54011', destZip3: '540', actualWeightLbs: 1.001, height: 11, width: 6,    length: 5,   state: null },
        { analysisId: aid, orderNumber: '0008', destZip: '49505', destZip3: '495', actualWeightLbs: 0.981, height: 10, width: 8,    length: 4,   state: null },
      ])
      .run()

    const resp = await routes.analysisCalculate.POST(
      new Request('http://x/', { method: 'POST' }) as unknown as NextRequest,
      makeCtx({ id: String(aid) }),
    )
    expect(resp.status).toBe(200)
    const b = await json(resp)
    expect(b.included_count).toBe(6)
    expect(b.excluded_count).toBe(0)

    const { sqlite } = await import('@/lib/db')
    const results = sqlite
      .prepare(
        `SELECT o.order_number as n, orr.zone, orr.billable_weight_value as bv,
                orr.billable_weight_unit as bu, orr.total_cost_cents as cents
         FROM order_results orr
         INNER JOIN orders o ON o.id = orr.order_id
         ORDER BY o.order_number`,
      )
      .all() as Array<{ n: string; zone: number; bv: number; bu: string; cents: number }>

    const expected: Record<string, { zone: number; bv: number; bu: string; cents: number }> = {
      '0001': { zone: 5, bv: 7,  bu: 'oz',  cents: 457 },
      '0002': { zone: 6, bv: 15, bu: 'oz',  cents: 629 },
      '0004': { zone: 5, bv: 3,  bu: 'lbs', cents: 730 },
      '0005': { zone: 7, bv: 12, bu: 'oz',  cents: 598 },
      '0007': { zone: 3, bv: 2,  bu: 'lbs', cents: 568 },
      '0008': { zone: 2, bv: 16, bu: 'oz',  cents: 572 },
    }
    for (const r of results) {
      expect(r).toEqual({ n: r.n, ...expected[r.n] })
    }

    // Analysis status flipped to complete.
    const status = sqlite
      .prepare('SELECT status FROM analyses WHERE id = ?')
      .get(aid) as { status: string }
    expect(status.status).toBe('complete')
  })

  it('unmapped ZIP lands in excluded_orders and NOT in order_results', async () => {
    const aid = await createAnalysis('exclude case')
    const wid = await createWarehouse(aid)

    await seedZoneMaps([
      { originZip3: '531', destZip3: '040', zone: 5 },
      // Note: 999 is intentionally omitted.
    ])
    const { db } = await import('@/lib/db')
    const { rateCards, rateCardEntries, orders } = await import('@/lib/db/schema')
    const [rc] = db
      .insert(rateCards)
      .values({ warehouseId: wid, name: 'rc', weightUnitMode: 'oz_only' })
      .returning()
      .all()
    db.insert(rateCardEntries)
      .values([{ rateCardId: rc.id, weightValue: 16, weightUnit: 'oz', zone: 5, priceCents: 500 }])
      .run()
    db.insert(orders)
      .values({
        analysisId: aid,
        orderNumber: 'BAD',
        destZip: '99900',
        destZip3: '999',
        actualWeightLbs: 0.5,
        height: null,
        width: null,
        length: null,
        state: null,
      })
      .run()

    const resp = await routes.analysisCalculate.POST(
      new Request('http://x/', { method: 'POST' }) as unknown as NextRequest,
      makeCtx({ id: String(aid) }),
    )
    expect(resp.status).toBe(200)
    const b = await json(resp)
    expect(b.excluded_count).toBe(1)
    expect(b.included_count).toBe(0)

    const excludedResp = await routes.analysisExcluded.GET(
      new Request('http://x/') as unknown as NextRequest,
      makeCtx({ id: String(aid) }),
    )
    const eb = await json(excludedResp)
    expect(eb.rows).toHaveLength(1)
    expect(eb.rows[0].reason).toBe('zone_not_found')

    const { sqlite } = await import('@/lib/db')
    const rrCount = sqlite.prepare('SELECT COUNT(*) as n FROM order_results').get() as { n: number }
    expect(rrCount.n).toBe(0)
  })
})

// ─── Projected cost fields ──────────────────────────────────────────────────────

describe('PATCH projected_order_count and projected_period validation', () => {
  async function patch(id: number, body: unknown) {
    return routes.analysisById.PATCH(
      asNextReq(jsonRequest('http://x/p', 'PATCH', body)),
      makeCtx({ id: String(id) }),
    )
  }

  it('persists projected_order_count and projected_period', async () => {
    const id = await createAnalysis()
    const r = await patch(id, { projected_order_count: 50000, projected_period: 'year' })
    expect(r.status).toBe(200)
    const b = await json(r)
    expect(b.projectedOrderCount).toBe(50000)
    expect(b.projectedPeriod).toBe('year')
  })

  it('accepts null to clear projected_order_count', async () => {
    const id = await createAnalysis()
    await patch(id, { projected_order_count: 100 })
    const r = await patch(id, { projected_order_count: null })
    expect(r.status).toBe(200)
    expect((await json(r)).projectedOrderCount).toBeNull()
  })

  it('rejects negative projected_order_count', async () => {
    const id = await createAnalysis()
    const r = await patch(id, { projected_order_count: -1 })
    expect(r.status).toBe(400)
  })

  it('rejects decimal projected_order_count', async () => {
    const id = await createAnalysis()
    const r = await patch(id, { projected_order_count: 50.5 })
    expect(r.status).toBe(400)
  })

  it('rejects invalid projected_period enum value', async () => {
    const id = await createAnalysis()
    const r = await patch(id, { projected_period: 'week' })
    expect(r.status).toBe(400)
  })

  it('accepts both period values', async () => {
    const id = await createAnalysis()
    let r = await patch(id, { projected_period: 'month' })
    expect(r.status).toBe(200)
    expect((await json(r)).projectedPeriod).toBe('month')
    r = await patch(id, { projected_period: 'year' })
    expect(r.status).toBe(200)
    expect((await json(r)).projectedPeriod).toBe('year')
  })
})
