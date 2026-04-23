import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { analyses, warehouses, orders } from '@/lib/db/schema'
import { sql } from 'drizzle-orm'
import { analysisCreateSchema } from '../_lib/schemas'
import { apiError, zodErrorResponse } from '../_lib/errors'
import { serializeAnalysis } from '../_lib/serializers'

export async function GET() {
  const rows = db
    .select({
      id: analyses.id,
      name: analyses.name,
      createdAt: analyses.createdAt,
      updatedAt: analyses.updatedAt,
      status: analyses.status,
      shareableToken: analyses.shareableToken,
      viewMode: analyses.viewMode,
      excludedLocations: analyses.excludedLocations,
      projectedOrderCount: analyses.projectedOrderCount,
      projectedPeriod: analyses.projectedPeriod,
    })
    .from(analyses)
    .orderBy(sql`${analyses.updatedAt} DESC`)
    .all()

  const whCounts = db
    .select({ analysisId: warehouses.analysisId, n: sql<number>`count(*)`.as('n') })
    .from(warehouses)
    .groupBy(warehouses.analysisId)
    .all()
  const orderCounts = db
    .select({ analysisId: orders.analysisId, n: sql<number>`count(*)`.as('n') })
    .from(orders)
    .groupBy(orders.analysisId)
    .all()

  const whMap = new Map(whCounts.map((r) => [r.analysisId, Number(r.n)]))
  const orderMap = new Map(orderCounts.map((r) => [r.analysisId, Number(r.n)]))

  return NextResponse.json(
    rows.map((row) => ({
      ...serializeAnalysis(row),
      warehouseCount: whMap.get(row.id) ?? 0,
      orderCount: orderMap.get(row.id) ?? 0,
    })),
  )
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError('BAD_REQUEST', 'Invalid JSON body', 400)
  }
  const parsed = analysisCreateSchema.safeParse(body)
  if (!parsed.success) return zodErrorResponse(parsed.error)

  const [row] = db.insert(analyses).values({ name: parsed.data.name }).returning().all()
  return NextResponse.json(serializeAnalysis(row), { status: 201 })
}
