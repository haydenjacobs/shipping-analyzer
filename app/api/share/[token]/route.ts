/**
 * GET /api/share/[token]
 *
 * Public route — no authentication required. Resolves an analysis by its
 * shareable_token and returns the same payload shape as
 * GET /api/analyses/[id]/results, so the share page can use the same
 * ResultsContent component.
 *
 * Security model: token is a UUID v4 (unguessable). Revocation is instant —
 * once the token is set to null by DELETE /api/analyses/[id]/share, this
 * route returns 404. The tool is single-user, so there is no concept of
 * "wrong user seeing someone else's data."
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  analyses,
  warehouses,
  orders,
  orderResults,
  excludedOrders as excludedOrdersTable,
} from '@/lib/db/schema'
import { eq, inArray, sql } from 'drizzle-orm'
import { notFound } from '../../_lib/errors'
import { serializeAnalysis } from '../../_lib/serializers'

const MAX_MATRIX_CELLS = 500_000

export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  if (!token) return notFound('Analysis')

  const analysisRow = db
    .select()
    .from(analyses)
    .where(eq(analyses.shareableToken, token))
    .get()

  // Double-check: the row must exist AND have a matching non-null token.
  // A revoked analysis has shareableToken = null, which can never equal the
  // requested token string, so this is defense-in-depth.
  if (!analysisRow || analysisRow.shareableToken !== token) return notFound('Analysis')

  if (analysisRow.status !== 'complete') {
    return NextResponse.json(
      { error: { code: 'NOT_CALCULATED', message: 'Analysis has not been calculated' } },
      { status: 409 },
    )
  }

  const whRows = db
    .select()
    .from(warehouses)
    .where(eq(warehouses.analysisId, analysisRow.id))
    .all()

  const orderCount = Number(
    db
      .select({ n: sql<number>`count(*)` })
      .from(orders)
      .where(eq(orders.analysisId, analysisRow.id))
      .get()?.n ?? 0,
  )

  if (orderCount * whRows.length > MAX_MATRIX_CELLS) {
    return NextResponse.json(
      { error: { code: 'MATRIX_TOO_LARGE', message: 'Analysis is too large to serve via share link.' } },
      { status: 413 },
    )
  }

  const orderRows = db
    .select()
    .from(orders)
    .where(eq(orders.analysisId, analysisRow.id))
    .all()
  const orderIds = orderRows.map((r) => r.id)

  const excludedRows =
    orderIds.length === 0
      ? []
      : db
          .select({ orderId: excludedOrdersTable.orderId })
          .from(excludedOrdersTable)
          .where(inArray(excludedOrdersTable.orderId, orderIds))
          .all()
  const excludedSet = new Set(excludedRows.map((r) => r.orderId))
  const includedIds = orderIds.filter((oid) => !excludedSet.has(oid))

  const resultRows =
    includedIds.length === 0
      ? []
      : db
          .select({
            orderId: orderResults.orderId,
            warehouseId: orderResults.warehouseId,
            zone: orderResults.zone,
            totalCostCents: orderResults.totalCostCents,
            billableWeightValue: orderResults.billableWeightValue,
            billableWeightUnit: orderResults.billableWeightUnit,
          })
          .from(orderResults)
          .where(inArray(orderResults.orderId, includedIds))
          .all()

  const byOrder = new Map<
    number,
    {
      warehouse_id: number
      zone: number
      total_cost_cents: number
      billable_weight_value: number
      billable_weight_unit: string
    }[]
  >()
  for (const r of resultRows) {
    const list = byOrder.get(r.orderId) ?? []
    list.push({
      warehouse_id: r.warehouseId,
      zone: r.zone,
      total_cost_cents: r.totalCostCents,
      billable_weight_value: r.billableWeightValue,
      billable_weight_unit: r.billableWeightUnit,
    })
    byOrder.set(r.orderId, list)
  }

  const matrix = includedIds
    .filter((oid) => byOrder.has(oid))
    .map((oid) => ({ order_id: oid, results: byOrder.get(oid)! }))

  const includedSet = new Set(includedIds)
  const ordersDetail = orderRows
    .filter((o) => includedSet.has(o.id))
    .map((o) => ({
      id: o.id,
      order_number: o.orderNumber,
      actual_weight_lbs: o.actualWeightLbs,
      height: o.height,
      width: o.width,
      length: o.length,
      dest_zip: o.destZip,
      state: o.state,
    }))

  const analysis = serializeAnalysis(analysisRow)

  return NextResponse.json({
    analysis: {
      id: analysis.id,
      name: analysis.name,
      viewMode: analysis.viewMode,
      excludedLocations: analysis.excludedLocations,
      status: analysis.status,
      projectedOrderCount: analysis.projectedOrderCount,
      projectedPeriod: analysis.projectedPeriod,
      shareableToken: analysis.shareableToken,
    },
    warehouses: whRows.map((w) => ({
      id: w.id,
      provider_name: w.providerName,
      location_label: w.locationLabel,
      origin_zip: w.originZip,
      origin_zip3: w.originZip3,
    })),
    orders_included_count: matrix.length,
    orders_excluded_count: excludedSet.size,
    matrix,
    orders: ordersDetail,
  })
}
