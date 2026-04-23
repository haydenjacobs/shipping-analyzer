import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { analyses, excludedOrders, orders } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { apiError, notFound } from '../../../_lib/errors'

function parseId(raw: string) {
  const id = Number(raw)
  return Number.isInteger(id) && id > 0 ? id : null
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await ctx.params
  const id = parseId(rawId)
  if (id === null) return apiError('BAD_REQUEST', 'invalid id', 400)

  const a = db.select({ id: analyses.id }).from(analyses).where(eq(analyses.id, id)).get()
  if (!a) return notFound('Analysis')

  // Join so the CSV consumer has the order number, ZIP, weight alongside the reason.
  const rows = db
    .select({
      id: excludedOrders.id,
      orderId: excludedOrders.orderId,
      warehouseId: excludedOrders.warehouseId,
      reason: excludedOrders.reason,
      details: excludedOrders.details,
      orderNumber: orders.orderNumber,
      destZip: orders.destZip,
      actualWeightLbs: orders.actualWeightLbs,
    })
    .from(excludedOrders)
    .innerJoin(orders, eq(excludedOrders.orderId, orders.id))
    .where(eq(orders.analysisId, id))
    .all()

  return NextResponse.json({ rows })
}
