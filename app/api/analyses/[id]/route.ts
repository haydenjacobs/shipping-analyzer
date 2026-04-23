import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { analyses, warehouses, rateCards, orders } from '@/lib/db/schema'
import { eq, inArray, sql } from 'drizzle-orm'
import { analysisPatchSchema } from '../../_lib/schemas'
import { apiError, notFound, zodErrorResponse } from '../../_lib/errors'
import { serializeAnalysis } from '../../_lib/serializers'

function parseId(raw: string) {
  const id = Number(raw)
  return Number.isInteger(id) && id > 0 ? id : null
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await ctx.params
  const id = parseId(rawId)
  if (id === null) return apiError('BAD_REQUEST', 'invalid id', 400)

  const row = db.select().from(analyses).where(eq(analyses.id, id)).get()
  if (!row) return notFound('Analysis')

  const whRows = db.select().from(warehouses).where(eq(warehouses.analysisId, id)).all()
  const rateCardsForWh =
    whRows.length === 0
      ? []
      : db
          .select()
          .from(rateCards)
          .where(inArray(rateCards.warehouseId, whRows.map((w) => w.id)))
          .all()

  const orderCount = Number(
    db
      .select({ n: sql<number>`count(*)` })
      .from(orders)
      .where(eq(orders.analysisId, id))
      .get()?.n ?? 0,
  )

  return NextResponse.json({
    ...serializeAnalysis(row),
    warehouses: whRows.map((w) => ({
      ...w,
      rateCards: rateCardsForWh
        .filter((rc) => rc.warehouseId === w.id)
        .map(({ id, warehouseId, name, weightUnitMode, createdAt }) => ({
          id,
          warehouseId,
          name,
          weightUnitMode,
          createdAt,
        })),
    })),
    orderCount,
  })
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await ctx.params
  const id = parseId(rawId)
  if (id === null) return apiError('BAD_REQUEST', 'invalid id', 400)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError('BAD_REQUEST', 'Invalid JSON body', 400)
  }
  const parsed = analysisPatchSchema.safeParse(body)
  if (!parsed.success) return zodErrorResponse(parsed.error)

  const patch: Record<string, unknown> = {}
  if (parsed.data.name !== undefined) patch.name = parsed.data.name
  if (parsed.data.view_mode !== undefined) patch.viewMode = parsed.data.view_mode
  if (parsed.data.excluded_locations !== undefined)
    patch.excludedLocations = JSON.stringify(parsed.data.excluded_locations)
  if (parsed.data.projected_order_count !== undefined)
    patch.projectedOrderCount = parsed.data.projected_order_count
  if (parsed.data.projected_period !== undefined) patch.projectedPeriod = parsed.data.projected_period
  if (parsed.data.status !== undefined) patch.status = parsed.data.status
  patch.updatedAt = sql`CURRENT_TIMESTAMP`

  const result = db.update(analyses).set(patch).where(eq(analyses.id, id)).returning().all()
  if (result.length === 0) return notFound('Analysis')
  return NextResponse.json(serializeAnalysis(result[0]))
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await ctx.params
  const id = parseId(rawId)
  if (id === null) return apiError('BAD_REQUEST', 'invalid id', 400)

  const result = db.delete(analyses).where(eq(analyses.id, id)).returning({ id: analyses.id }).all()
  if (result.length === 0) return notFound('Analysis')
  // ON DELETE CASCADE on warehouses/orders handles the rest.
  return NextResponse.json({ deleted: true })
}
